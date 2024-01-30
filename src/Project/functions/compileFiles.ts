import { RojoResolver } from "@easy-games/unity-rojo-resolver";
import { renderAST } from "@roblox-ts/luau-ast";
import fs, { outputFile } from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { checkRojoConfig } from "Project/functions/checkRojoConfig";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { transformPaths } from "Project/transformers/builtin/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { createTransformerWatcher } from "Project/transformers/createTransformerWatcher";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { AirshipBuildFile, ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import { getRootDirs } from "Shared/util/getRootDirs";
import { MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createTransformServices } from "TSTransformer/util/createTransformServices";
import ts from "typescript";

function inferProjectType(data: ProjectData, rojoResolver: RojoResolver): ProjectType {
	if (data.isPackage) {
		return ProjectType.Package;
	} else if (rojoResolver.isGame) {
		return ProjectType.Game;
	} else {
		return ProjectType.Model;
	}
}

function emitResultFailure(messageText: string): ts.EmitResult {
	return {
		emitSkipped: false,
		diagnostics: [createTextDiagnostic(messageText)],
	};
}

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
	sourceFiles: Array<ts.SourceFile>,
): ts.EmitResult {
	const compilerOptions = program.getCompilerOptions();

	const multiTransformState = new MultiTransformState();

	const outDir = compilerOptions.outDir!;

	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(outDir);

	for (const warning of rojoResolver.getWarnings()) {
		LogService.warn(warning);
	}

	checkRojoConfig(data, rojoResolver, getRootDirs(compilerOptions), pathTranslator);

	for (const sourceFile of program.getSourceFiles()) {
		if (!path.normalize(sourceFile.fileName).startsWith(data.nodeModulesPath)) {
			checkFileName(sourceFile.fileName);
		}
	}

	const pkgRojoResolvers = compilerOptions.typeRoots!.map(RojoResolver.synthetic);
	const nodeModulesPathMapping = createNodeModulesPathMapping(compilerOptions.typeRoots!);

	const reverseSymlinkMap = getReverseSymlinkMap(program);

	const projectType = data.projectOptions.type ?? inferProjectType(data, rojoResolver);

	if (projectType !== ProjectType.Package && data.rojoConfigPath === undefined) {
		return emitResultFailure("Non-package projects must have a Rojo project file!");
	}

	// let runtimeLibRbxPath: RbxPath | undefined;
	// if (projectType !== ProjectType.Package) {
	// 	runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(path.join(data.includePath, "RuntimeLib.lua"));
	// 	if (!runtimeLibRbxPath) {
	// 		return emitResultFailure("Rojo project contained no data for include folder!");
	// 	} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
	// 		return emitResultFailure("Runtime library cannot be in a server-only or client-only container!");
	// 	} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
	// 		return emitResultFailure("Runtime library cannot be in an isolated container!");
	// 	}
	// }
	// console.log("RuntimeLib:", runtimeLibRbxPath);

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	LogService.writeLineIfVerbose(`Now running TypeScript compiler:`);
	const startTime = Date.now();

	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();
	const fileMetadataWriteQueue = new Map<ts.SourceFile, string>();

	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;

	let proxyProgram = program;

	if (compilerOptions.plugins && compilerOptions.plugins.length > 0) {
		benchmarkIfVerbose(`running transformers..`, () => {
			const pluginConfigs = getPluginConfigs(data.tsConfigPath);
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

	const buildFile: AirshipBuildFile = {
		components: {},
		extends: {},
	};

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
				multiTransformState,
				compilerOptions,
				rojoResolver,
				pkgRojoResolvers,
				nodeModulesPathMapping,
				reverseSymlinkMap,
				undefined,
				typeChecker,
				projectType,
				sourceFile,
			);

			const luauAST = transformSourceFile(transformState, sourceFile);
			if (DiagnosticService.hasErrors()) return;

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });

			const airshipBehaviours = transformState.airshipBehaviours;
			for (const behaviour of airshipBehaviours) {
				const airshipBehaviourMetadata = behaviour.metadata;

				if (airshipBehaviourMetadata) {
					assert(!fileMetadataWriteQueue.has(sourceFile), "Should never happen dawg");
					fileMetadataWriteQueue.set(sourceFile, JSON.stringify(airshipBehaviourMetadata, null, "\t"));
				}

				const relativeFilePath = path.relative(
					pathTranslator.outDir,
					pathTranslator.getOutputPath(sourceFile.fileName),
				);
				if (behaviour.name) {
					for (const ext of behaviour.extends) {
						const extensions = (buildFile.extends[ext] ??= []);
						extensions.push(behaviour.name);
					}

					buildFile.components[behaviour.name] = {
						id: behaviour.id,
						filePath: relativeFilePath,
						metadataFilePath:
							airshipBehaviourMetadata !== undefined ? relativeFilePath + ".json~" : undefined,
						extends: behaviour.extends,
					};
				}
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

				if (compilerOptions.declaration) {
					proxyProgram.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
					});
				}

				if (hasMetadata) {
					const source = fileMetadataWriteQueue.get(sourceFile);
					fs.outputFileSync(metadataPathOutPath, source);
					metadataCount++;
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

	const buildFilePath = path.join(pathTranslator.outDir, "Airship.build~");

	const oldBuildFileSource = fs.existsSync(buildFilePath) ? fs.readFileSync(buildFilePath).toString() : "";
	const newBuildFileSource = JSON.stringify(buildFile, null, "\t");

	if (oldBuildFileSource !== newBuildFileSource) {
		fs.outputFileSync(buildFilePath, newBuildFileSource);
	}

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
