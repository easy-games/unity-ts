import chokidar from "chokidar";
import fs from "fs-extra";
import { ProjectData } from "Project";
import { buildTypes } from "Project/functions/buildTypes";
import { checkFileName } from "Project/functions/checkFileName";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyNodeModules } from "Project/functions/copyInclude";
import { copyItem } from "Project/functions/copyItem";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { createJsonDiagnosticReporter, jsonReporter } from "Project/functions/json";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { walkDirectorySync } from "Project/util/walkDirectorySync";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";
import { getRootDirs } from "Shared/util/getRootDirs";
import { AirshipBuildState } from "TSTransformer";
import ts from "typescript";

const CHOKIDAR_OPTIONS: chokidar.WatchOptions = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	disableGlobbing: true,
};

function fixSlashes(fsPath: string) {
	return fsPath.replace(/\\/g, "/");
}

export function setupProjectWatchProgram(data: ProjectData, usePolling: boolean) {
	const { fileNames, options } = getParsedCommandLine(data);
	const emitJsonToStdout = data.projectOptions.json;
	const fileNamesSet = new Set(fileNames);

	let initialCompileCompleted = false;
	let collecting = false;
	let filesToAdd = new Set<string>();
	let filesToChange = new Set<string>();
	let filesToDelete = new Set<string>();

	const watchBuildState = new AirshipBuildState();

	const watchReporter = ts.createWatchStatusReporter(ts.sys, true);
	const diagnosticReporter = emitJsonToStdout
		? createJsonDiagnosticReporter(data)
		: ts.createDiagnosticReporter(ts.sys, true);

	function reportText(messageText: string) {
		if (emitJsonToStdout) {
			jsonReporter("watchReport", {
				messageText,
				category: ts.DiagnosticCategory.Message,
			});
		} else {
			watchReporter(
				{
					category: ts.DiagnosticCategory.Message,
					messageText,
					code: 0,
					file: undefined,
					length: undefined,
					start: undefined,
				},
				ts.sys.newLine,
				options,
			);
		}
	}

	function reportEmitResult(emitResult: ts.EmitResult) {
		for (const diagnostic of emitResult.diagnostics) {
			diagnosticReporter(diagnostic);
		}
		const amtErrors = emitResult.diagnostics.filter(v => v.category === ts.DiagnosticCategory.Error).length;
		if (emitJsonToStdout) {
			if (amtErrors > 0) {
				jsonReporter("finishedCompileWithErrors", { errorCount: amtErrors });
			} else {
				jsonReporter("finishedCompile", {});
			}
		} else {
			reportText(`Found ${amtErrors} error${amtErrors === 1 ? "" : "s"}. Watching for file changes.`);
		}
	}

	let program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
	let pathTranslator: PathTranslator | undefined;

	const createProgram = createProgramFactory(data, options);
	function refreshProgram() {
		program = createProgram([...fileNamesSet], options);
		pathTranslator = createPathTranslator(program, data.projectOptions);
	}

	function runInitialCompile() {
		refreshProgram();
		assert(program && pathTranslator);
		cleanup(pathTranslator, data.projectOptions);
		if (data.projectOptions.type !== ProjectType.AirshipBundle) {
			// copyInclude(data);
		}
		if (data.projectOptions.copyNodeModules) {
			copyNodeModules(data)
				.then(() => {})
				.catch(err => {
					console.error(err);
				});
		}
		copyFiles(data, pathTranslator, new Set(getRootDirs(options)));
		const sourceFiles = getChangedSourceFiles(program);
		const emitResult = compileFiles(program.getProgram(), data, pathTranslator, watchBuildState, sourceFiles);
		if (!emitResult.emitSkipped) {
			buildTypes(data);

			initialCompileCompleted = true;
		}
		return emitResult;
	}

	const filesToCompile = new Set<string>();
	const filesToCopy = new Set<string>();
	const filesToClean = new Set<string>();
	function runIncrementalCompile(additions: Set<string>, changes: Set<string>, removals: Set<string>): ts.EmitResult {
		console.log("run incr cmpl");
		const buildFile = watchBuildState.buildFile;

		for (const fsPath of additions) {
			if (fs.statSync(fsPath).isDirectory()) {
				walkDirectorySync(fsPath, item => {
					if (isCompilableFile(item)) {
						fileNamesSet.add(item);
						filesToCompile.add(item);
					}
				});
			} else if (isCompilableFile(fsPath)) {
				fileNamesSet.add(fsPath);
				filesToCompile.add(fsPath);
			} else {
				// checks for copying `init.*.d.ts`
				checkFileName(fsPath);
				filesToCopy.add(fsPath);
			}
		}

		for (const fsPath of changes) {
			if (isCompilableFile(fsPath)) {
				filesToCompile.add(fsPath);
			} else {
				filesToCopy.add(fsPath);
			}
		}

		for (const fsPath of removals) {
			fileNamesSet.delete(fsPath);
			filesToClean.add(fsPath);

			// remove entries
			const componentMap = watchBuildState.fileComponentMap[fsPath];
			if (componentMap) {
				for (const componentId of componentMap) {
					for (const [, extensions] of Object.entries(buildFile.extends)) {
						if (!extensions.includes(componentId)) continue;
						extensions.splice(extensions.indexOf(componentId), 1);
					}
					delete watchBuildState.buildFile.behaviours[componentId];
				}
			}
		}

		refreshProgram();
		assert(program && pathTranslator);

		const sourceFiles = getChangedSourceFiles(program, options.incremental ? undefined : [...filesToCompile]);
		const emitResult = compileFiles(program.getProgram(), data, pathTranslator, watchBuildState, sourceFiles);
		if (emitResult.emitSkipped) {
			// exit before copying to prevent half-updated out directory
			return emitResult;
		}

		for (const fsPath of filesToClean) {
			tryRemoveOutput(pathTranslator, pathTranslator.getOutputPath(fsPath));
			if (options.declaration) {
				tryRemoveOutput(pathTranslator, pathTranslator.getOutputDeclarationPath(fsPath));
			}
		}
		for (const fsPath of filesToCopy) {
			copyItem(data, pathTranslator, fsPath);
		}

		buildTypes(data);

		filesToCompile.clear();
		filesToCopy.clear();
		filesToClean.clear();

		return emitResult;
	}

	function runCompile() {
		try {
			if (!initialCompileCompleted) {
				return runInitialCompile();
			} else {
				const additions = filesToAdd;
				const changes = filesToChange;
				const removals = filesToDelete;
				filesToAdd = new Set();
				filesToChange = new Set();
				filesToDelete = new Set();
				return runIncrementalCompile(additions, changes, removals);
			}
		} catch (e) {
			if (e instanceof DiagnosticError) {
				return {
					emitSkipped: true,
					diagnostics: e.diagnostics,
				};
			} else {
				throw e;
			}
		}
	}

	function closeEventCollection() {
		collecting = false;
		reportEmitResult(runCompile());
	}

	function openEventCollection() {
		if (!collecting) {
			collecting = true;

			if (emitJsonToStdout) {
				jsonReporter("startingCompile", { initial: false });
			} else {
				reportText("File change detected. Starting incremental compilation...");
			}

			setTimeout(closeEventCollection, 100);
		}
	}

	function collectAddEvent(fsPath: string) {
		filesToAdd.add(fixSlashes(fsPath));
		openEventCollection();
	}

	function collectChangeEvent(fsPath: string) {
		filesToChange.add(fixSlashes(fsPath));
		openEventCollection();
	}

	function collectDeleteEvent(fsPath: string) {
		filesToDelete.add(fixSlashes(fsPath));
		openEventCollection();
	}

	const chokidarOptions: chokidar.WatchOptions = { ...CHOKIDAR_OPTIONS, usePolling };


	console.log("starting chokidar");
	chokidar
		.watch(getRootDirs(options), chokidarOptions)
		.on("add", collectAddEvent)
		.on("addDir", collectAddEvent)
		.on("change", collectChangeEvent)
		.on("unlink", collectDeleteEvent)
		.on("unlinkDir", collectDeleteEvent)
		.once("ready", () => {
			console.log("ready")
			if (emitJsonToStdout) {
				jsonReporter("startingCompile", { initial: true });
			} else {
				reportText("Starting compilation in watch mode...");
			}
			reportEmitResult(runCompile());
		});

	console.log("chokidar broken?");
}
