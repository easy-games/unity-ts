import { renderAST } from "@roblox-ts/luau-ast";
import fs from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { jsonReporter } from "Project/functions/json";
import { shouldGenerateLuauPackageDeclarations } from "Project/functions/shouldGenerateLuauPackageDeclarations";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { createTransformerWatcher } from "Project/transformers/createTransformerWatcher";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { LogService } from "Shared/classes/LogService";
import { PathHint, PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { warnings } from "Shared/diagnostics";
import { AirshipBuildFile, AirshipScriptMetadata, ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import {
	AirshipBuildState,
	BUILD_FILE,
	CompliationContext,
	EDITOR_FILE,
	MultiTransformState,
	transformSourceFile,
	TransformState,
} from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { FlameworkSymbolProvider } from "TSTransformer/classes/FlameworkSymbolProvider";
import { createTransformServices } from "TSTransformer/util/createTransformServices";
import { isAirshipSingletonClassNoState } from "TSTransformer/util/extendsAirshipBehaviour";
import ts from "typescript";

function getReverseSymlinkMap(program: ts.Program) {
	const result = new Map<string, string>();

	const directoriesMap = program.getSymlinkCache?.()?.getSymlinkedDirectories();
	if (directoriesMap) {
		directoriesMap.forEach((dir, fsPath) => {
			if (typeof dir !== "boolean") {
				result.set(dir.real, fsPath);
			}
		});
	}

	return result;
}

export function isPackage(relativePath: string) {
	return relativePath.startsWith("AirshipPackages" + path.sep);
}

interface FileWriteEntry {
	sourceFile: ts.SourceFile;
	source: string;
	context?: CompliationContext;
}

/** Make all properties in T non-readonly. */
type Writable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * 'transpiles' TypeScript project into a logically identical Luau project.
 *
 * writes rendered Luau source to the out directory.
 */
export function compileFiles(
	program: ts.Program,
	data: ProjectData,
	pathTranslator: PathTranslator,
	buildState: AirshipBuildState,
	sourceFiles: Array<ts.SourceFile>,
): ts.EmitResult {
	const { json: asJson, publish: isPublish } = data.projectOptions;
	const compilerOptions = program.getCompilerOptions();

	const watch = compilerOptions.watch ?? false;
	const incremental = compilerOptions.incremental ?? false;
	const emitBuildInfo = !data.codeOnlyPublish;

	if (incremental) {
		buildState.cleanup(pathTranslator);
	}

	const pkgJson: { name: string } = JSON.parse(
		fs
			.readFileSync(path.join(program.getCurrentDirectory(), data.projectOptions.package, "package.json"))
			.toString(),
	);

	const multiTransformState = new MultiTransformState();

	for (const sourceFile of program.getSourceFiles()) {
		if (!path.normalize(sourceFile.fileName).startsWith(data.nodeModulesPath)) {
			checkFileName(sourceFile.fileName);
		}
	}

	const nodeModulesPathMapping = createNodeModulesPathMapping(compilerOptions.typeRoots!);

	const reverseSymlinkMap = getReverseSymlinkMap(program);

	const projectType = data.projectOptions.type ?? ProjectType.Game;

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	LogService.writeLineIfVerbose(`Now running TypeScript compiler:`);

	const fileWriteQueue = new Array<FileWriteEntry>();
	const fileMetadataWriteQueue = new Map<ts.SourceFile, string>();

	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;

	let proxyProgram = program;
	let useFlameworkInternal = true;

	if (compilerOptions.plugins && compilerOptions.plugins.length > 0) {
		benchmarkIfVerbose(`Running transformers...`, () => {
			const pluginConfigs = getPluginConfigs(data.tsConfigPath);
			for (const pluginConfig of pluginConfigs) {
				// Disable internal compiler flamework if external version in use
				if (pluginConfig.transform === "@easy-games/unity-flamework-transformer") {
					DiagnosticService.addDiagnostic(warnings.flameworkTransformer);
					useFlameworkInternal = false;
				}

				pluginConfig.compiler = {
					projectDir: path.relative(process.cwd(), path.dirname(data.tsConfigPath)) || ".",
					packageDir: path.relative(process.cwd(), data.projectOptions.package),
				};
			}

			const transformerList = createTransformerList(program, pluginConfigs, data.projectPath);
			const transformers = flattenIntoTransformers(transformerList);
			if (transformers.length > 0) {
				const { service, updateFile } = (data.transformerWatcher ??= createTransformerWatcher(program));
				const transformResult = ts.transformNodes(
					undefined,
					undefined,
					ts.factory,
					compilerOptions,
					sourceFiles,
					transformers,
					false,
				);

				if (transformResult.diagnostics) DiagnosticService.addDiagnostics(transformResult.diagnostics);

				for (const sourceFile of transformResult.transformed) {
					if (ts.isSourceFile(sourceFile)) {
						updateFile(sourceFile.fileName, ts.createPrinter().printFile(sourceFile));
					}
				}

				proxyProgram = service.getProgram()!;
			}
		});
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	const typeChecker = proxyProgram.getTypeChecker();
	const services = createTransformServices(proxyProgram, typeChecker, data);

	const buildFile: AirshipBuildFile = buildState.buildFile;
	const editorFile = buildState.editorInfo;
	buildState.editorInfo.id = pkgJson.name;

	let flamework: FlameworkSymbolProvider | undefined;
	if (useFlameworkInternal) {
		flamework = new FlameworkSymbolProvider(proxyProgram, compilerOptions, data, services);
		flamework.registerInterestingFiles();
	}

	// Information step
	const singletonSymbol = services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();
	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);

		// Do a visit of the top-level nodes of each file to register imports
		ts.forEachChild(sourceFile, node => {
			// Handling singletons
			if (ts.isClassLike(node) && isAirshipSingletonClassNoState(singletonSymbol, typeChecker, node)) {
				const type = typeChecker.getTypeAtLocation(node);
				buildState.registerSingletonTypeForFile(pathTranslator, typeChecker, sourceFile, type);
				return true;
			}
		});
	}

	if (isPublish) {
		const sharedDirectory = pathTranslator.getOutDir(PathHint.Shared);
		if (fs.pathExistsSync(sharedDirectory)) fs.removeSync(sharedDirectory);

		const clientDirectory = pathTranslator.getOutDir(PathHint.Client);
		if (fs.pathExistsSync(clientDirectory)) fs.removeSync(clientDirectory);

		const serverDirectory = pathTranslator.getOutDir(PathHint.Server);
		if (fs.pathExistsSync(serverDirectory)) fs.removeSync(serverDirectory);
	}

	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		const relativePath = path.relative(process.cwd(), sourceFile.fileName);

		benchmarkIfVerbose(`${progress} compile ${relativePath}`, () => {
			DiagnosticService.addDiagnostics(ts.getPreEmitDiagnostics(proxyProgram, sourceFile));
			DiagnosticService.addDiagnostics(getCustomPreEmitDiagnostics(data, sourceFile));
			if (DiagnosticService.hasErrors()) return;

			const transformState = new TransformState(
				proxyProgram,
				data,
				services,
				pathTranslator,
				buildState,
				multiTransformState,
				compilerOptions,
				nodeModulesPathMapping,
				reverseSymlinkMap,
				typeChecker,
				projectType,
				flamework,
				sourceFile,
			);

			if (isPublish && !isPackage(relativePath)) {
				const serverWriteEntry = transformState.useContext(CompliationContext.Server, context => {
					const luauAST = transformSourceFile(transformState, sourceFile);
					if (DiagnosticService.hasErrors()) return;
					const source = renderAST(luauAST);
					return { sourceFile, source, context } satisfies FileWriteEntry;
				});

				if (DiagnosticService.hasErrors() || !serverWriteEntry) return;

				const clientWriteEntry = transformState.useContext(CompliationContext.Client, context => {
					const luauAST = transformSourceFile(transformState, sourceFile);
					if (DiagnosticService.hasErrors()) return;
					const source = renderAST(luauAST);
					return { sourceFile, source, context } satisfies FileWriteEntry;
				});

				if (!clientWriteEntry) return;

				if (clientWriteEntry.source !== serverWriteEntry.source) {
					fileWriteQueue.push(clientWriteEntry);
					fileWriteQueue.push(serverWriteEntry);
				} else {
					fileWriteQueue.push({ ...serverWriteEntry, context: CompliationContext.Shared });
				}
			} else {
				const luauAST = transformSourceFile(transformState, sourceFile);
				if (DiagnosticService.hasErrors()) return;
				const source = renderAST(luauAST);
				fileWriteQueue.push({ sourceFile, source });
			}

			if (emitBuildInfo) {
				const airshipBehaviours = transformState.airshipBehaviours;
				const scriptableObjects = transformState.scriptableObjects;
				const serializables = transformState.serializables;

				// In watch mode we want to ensure entries are updated
				if (watch && !incremental) {
					const fileMap = (buildState.fileComponentMap[sourceFile.fileName] ??= []);
					for (const entry of fileMap) {
						const matchingBehaviour = airshipBehaviours.find(f => f.name === entry);

						for (const [, extensions] of Object.entries(buildFile.extends)) {
							if (!extensions.includes(entry)) continue;
							extensions.splice(extensions.indexOf(entry), 1);
						}

						if (!matchingBehaviour) {
							delete buildFile.behaviours[entry];
						}
					}
				}

				let scriptMetadata: Writable<AirshipScriptMetadata> = {
					behaviour: undefined,
					scriptable: undefined,
					serializables: undefined,
				};

				if (data.flags.serializableClassTypes) {
					if (serializables.length > 0) {
						const types = (scriptMetadata.serializables ??= []);

						for (const serializable of serializables) {
							const relativeFilePath = path.relative(
								pathTranslator.outDir,
								pathTranslator.getOutputPath(sourceFile.fileName),
							);
							buildState.registerSerializable(serializable, relativeFilePath);

							types.push(serializable);
						}
					}
				}

				if (airshipBehaviours.length > 0 || serializables.length > 0 || scriptableObjects.length > 0) {
					for (const scriptable of scriptableObjects) {
						const airshipBehaviourMetadata = scriptable.metadata;

						if (airshipBehaviourMetadata) scriptMetadata.scriptable = airshipBehaviourMetadata;

						// Backwards compat. reasons
						scriptMetadata = { ...scriptMetadata, ...scriptMetadata.behaviour } as AirshipScriptMetadata;

						const relativeFilePath = path.relative(
							pathTranslator.outDir,
							pathTranslator.getOutputPath(sourceFile.fileName),
						);

						buildState.registerBehaviourInheritance(scriptable);
						buildState.registerScriptableObject(scriptable, relativeFilePath);
						buildState.linkBehaviourToFile(scriptable, sourceFile);
					}

					for (const behaviour of airshipBehaviours) {
						const airshipBehaviourMetadata = behaviour.metadata;

						if (airshipBehaviourMetadata) scriptMetadata.behaviour = airshipBehaviourMetadata;

						// Backwards compat. reasons
						scriptMetadata = { ...scriptMetadata, ...scriptMetadata.behaviour } as AirshipScriptMetadata;

						const relativeFilePath = path.relative(
							pathTranslator.outDir,
							pathTranslator.getOutputPath(sourceFile.fileName),
						);

						buildState.registerBehaviourInheritance(behaviour);
						buildState.registerBehaviour(behaviour, relativeFilePath);
						buildState.linkBehaviourToFile(behaviour, sourceFile);
					}
				}

				if (
					scriptMetadata &&
					!fileMetadataWriteQueue.has(sourceFile) &&
					(scriptMetadata.behaviour || scriptMetadata.serializables || scriptMetadata.scriptable)
				) {
					fileMetadataWriteQueue.set(sourceFile, JSON.stringify(scriptMetadata, null, "\t"));
				}
			}

			if (asJson) {
				jsonReporter("compiledFile", {
					fileName: sourceFile.fileName,
				});
			}
		});
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	const emittedFiles = new Array<string>();
	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			let skipCount = 0;
			let writeCount = 0;
			let metadataCount = 0;

			for (const { sourceFile, source, context } of fileWriteQueue) {
				let pathHint: PathHint | undefined;
				if (context !== undefined) {
					switch (context) {
						case CompliationContext.Client:
							pathHint = PathHint.Client;
							break;
						case CompliationContext.Server:
							pathHint = PathHint.Server;
							break;
						case CompliationContext.Shared:
							pathHint = PathHint.Shared;
							break;
					}
				}

				const outPath = pathTranslator.getOutputPath(sourceFile.fileName, pathHint);
				const hasMetadata = fileMetadataWriteQueue.has(sourceFile);
				const metadataPathOutPath = outPath + ".json~";

				if (data.writeOnlyChanged) {
					if (fs.existsSync(outPath)) {
						const isSourceUnchanged = fs.readFileSync(outPath).toString() === source;
						const isMetadataSourceUnchanged =
							!hasMetadata ||
							(fs.existsSync(metadataPathOutPath) &&
								fileMetadataWriteQueue.get(sourceFile) ===
									fs.readFileSync(metadataPathOutPath).toString());

						if (isSourceUnchanged && isMetadataSourceUnchanged) {
							if (asJson) {
								jsonReporter("compiledFileWrite", {
									fileName: sourceFile.fileName,
									changed: false,
								});
							}

							skipCount++;
							continue;
						}
					}
				}

				if (asJson) {
					jsonReporter("compiledFileWrite", {
						fileName: sourceFile.fileName,
						changed: true,
					});
				}

				fs.outputFileSync(outPath, source);
				emittedFiles.push(outPath);
				writeCount++;

				if (
					shouldGenerateLuauPackageDeclarations(
						pathTranslator,
						compilerOptions,
						data.projectOptions,
						sourceFile,
					)
				) {
					proxyProgram.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives],
					});
				}

				if (emitBuildInfo) {
					if (hasMetadata) {
						const source = fileMetadataWriteQueue.get(sourceFile);
						fs.outputFileSync(metadataPathOutPath, source);
						metadataCount++;
					} else if (fs.existsSync(metadataPathOutPath)) {
						// Remove metadata path if no longer applicable
						fs.removeSync(metadataPathOutPath);
					}
				}
			}

			LogService.writeLineIfVerbose(`\nCompiled ${writeCount} TypeScript file${writeCount !== 1 ? "s" : ""}`);

			if (metadataCount > 0) {
				LogService.writeLineIfVerbose(
					`Generated ${metadataCount} AirshipBehaviour${metadataCount !== 1 ? "s" : ""}`,
				);
			}

			if (skipCount > 0) {
				LogService.writeLineIfVerbose(
					`Skipped ${skipCount} file${skipCount !== 1 ? "s" : ""} not changed since last compile.`,
				);
			}
		});
	}

	if (emitBuildInfo) {
		const typescriptDir = path.dirname(data.tsConfigPath);
		let editorMetadataPath: string;
		{
			editorMetadataPath = path.join(typescriptDir, EDITOR_FILE);

			const oldBuildFileSource = fs.existsSync(editorMetadataPath)
				? fs.readFileSync(editorMetadataPath).toString()
				: "";

			const newBuildFileSource = JSON.stringify(editorFile, null, "\t");

			if (oldBuildFileSource !== newBuildFileSource) {
				fs.outputFileSync(editorMetadataPath, newBuildFileSource);
			}
		}

		const buildFilePath = path.join(typescriptDir, BUILD_FILE);
		{
			const oldBuildFileSource = fs.existsSync(buildFilePath) ? fs.readFileSync(buildFilePath).toString() : "";
			const newBuildFileSource = JSON.stringify(buildFile, null, "\t");

			if (oldBuildFileSource !== newBuildFileSource) {
				fs.outputFileSync(buildFilePath, newBuildFileSource);
			}
		}
	}

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
