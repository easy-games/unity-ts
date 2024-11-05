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
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { warnings } from "Shared/diagnostics";
import { AirshipBuildFile, ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import {
	AirshipBuildState,
	BUILD_FILE,
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
	const asJson = data.projectOptions.json;
	const compilerOptions = program.getCompilerOptions();

	const watch = compilerOptions.watch ?? false;
	const incremental = compilerOptions.incremental ?? false;

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

	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();
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

	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
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

			const luauAST = transformSourceFile(transformState, sourceFile);
			if (DiagnosticService.hasErrors()) return;

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });

			const airshipBehaviours = transformState.airshipBehaviours;

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

			if (airshipBehaviours.length > 0) {
				for (const behaviour of airshipBehaviours) {
					const airshipBehaviourMetadata = behaviour.metadata;

					if (airshipBehaviourMetadata) {
						assert(!fileMetadataWriteQueue.has(sourceFile));
						fileMetadataWriteQueue.set(sourceFile, JSON.stringify(airshipBehaviourMetadata, null, "\t"));
					}

					const relativeFilePath = path.relative(
						pathTranslator.outDir,
						pathTranslator.getOutputPath(sourceFile.fileName),
					);

					buildState.registerBehaviourInheritance(behaviour);
					buildState.registerBehaviour(behaviour, relativeFilePath);
					buildState.linkBehaviourToFile(behaviour, sourceFile);
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

			for (const { sourceFile, source } of fileWriteQueue) {
				const outPath = pathTranslator.getOutputPath(sourceFile.fileName);
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
							skipCount++;
							continue;
						}
					}
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

				if (hasMetadata) {
					const source = fileMetadataWriteQueue.get(sourceFile);
					fs.outputFileSync(metadataPathOutPath, source);
					metadataCount++;
				} else if (fs.existsSync(metadataPathOutPath)) {
					// Remove metadata path if no longer applicable
					fs.removeSync(metadataPathOutPath);
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

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
