import { findTsConfigPath, getPackageJson, getTsConfigProjectOptions } from "CLI/util/findTsConfigPath";
import { existsSync } from "fs";
import path from "path";
import { buildTypes } from "Project/functions/buildTypes";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles, isPackage } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyNodeModules } from "Project/functions/copyInclude";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProjectData } from "Project/functions/createProjectData";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { createJsonDiagnosticReporter, jsonReporter } from "Project/functions/json";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import { LogService } from "Shared/classes/LogService";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { LoggableError } from "Shared/errors/LoggableError";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectOptions, TypeScriptConfiguration } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import { AirshipBuildState, BUILD_FILE, EDITOR_FILE } from "TSTransformer";
import ts from "typescript";
import yargs from "yargs";

interface BuildFlags {
	project: string;
	package: string | undefined;
}

const enum Group {
	Deployment = "Publishing",
	Project = "Project",
	Compilation = "Compilation",
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, BuildFlags & Partial<ProjectOptions>>>({
	command: "build",

	describe: "Build a project",

	builder: {
		project: {
			alias: "p",
			string: true,
			default: ".",
			describe: "The location of tsconfig.json",
			group: Group.Project,
		},
		codePublish: {
			type: "boolean",
			alias: ["P", "skipPackages"],
			describe: "Only compile game code, and skip emitting metadata (code-only deploy, requires --publish)",
			boolean: true,
			default: false,
			group: Group.Deployment,
			implies: ["publish"],
		},
		json: {
			hidden: true,
			boolean: true,
			default: false,
		},
		publish: {
			alias: "D",
			boolean: true,
			default: false,
			describe: "Run the compiler in deploy mode",
			group: Group.Deployment,
		},
		package: {
			string: true,
			describe: "The location of package.json",
			group: Group.Project,
		},
		verbose: {
			boolean: true,
			describe: "enable verbose logs",
		},
		watch: {
			alias: "w",
			boolean: true,
			describe: "enable watch mode",
			group: Group.Compilation,
		},
		incremental: {
			alias: "i",
			boolean: true,
			describe: "Build with incremental mode",
			default: undefined,
			group: Group.Compilation,
		},
		writeOnlyChanged: {
			alias: "writeOnlyChanged",
			boolean: true,
			describe: "enable to only write changed files",
			group: Group.Compilation,
		},
	},

	handler: async argv => {
		try {
			const tsConfigPath = findTsConfigPath(argv.project);

			// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
			const projectOptions: ProjectOptions = Object.assign(
				{},
				DEFAULT_PROJECT_OPTIONS,
				getTsConfigProjectOptions(tsConfigPath),
				argv,
			);

			const tsconfig = ts.readJson(tsConfigPath, ts.sys) as TypeScriptConfiguration;

			const packageJsonDir = argv.package ?? projectOptions.package;
			if (packageJsonDir === undefined || !existsSync(packageJsonDir)) {
				throw new ProjectError(`package.json not found at ${packageJsonDir}`);
			}

			const packageJson = getPackageJson(packageJsonDir);

			LogService.verbose = projectOptions.verbose === true && projectOptions.json === false;

			if (tsconfig.airship === undefined) {
				throw new ProjectError("You are trying to compile an invalid Typescript project");
			}

			if (projectOptions.codePublish && !projectOptions.publish) {
				throw new ProjectError("codePublish must be used in conjunction with publish");
			}

			projectOptions.nodePackageName = packageJson.name;
			const data = createProjectData(tsConfigPath, packageJsonDir, projectOptions);

			const diagnosticReporter = projectOptions.json
				? createJsonDiagnosticReporter(data)
				: ts.createDiagnosticReporter(ts.sys, true);

			if (projectOptions.watch) {
				setupProjectWatchProgram(data, projectOptions.usePolling);
			} else {
				const program = createProjectProgram(data);
				const pathTranslator = createPathTranslator(program, projectOptions);

				const buildState = new AirshipBuildState();

				if (projectOptions.incremental) {
					buildState.loadBuildFile(BUILD_FILE);
					buildState.loadEditorInfo(EDITOR_FILE);
				}

				cleanup(pathTranslator);

				if (projectOptions.copyNodeModules) {
					await copyNodeModules(data);
				}

				copyFiles(
					data,
					pathTranslator,
					new Set(getRootDirs(program.getCompilerOptions(), data.projectOptions)),
				);

				let sourceFiles = getChangedSourceFiles(program);

				if (projectOptions.codePublish) {
					LogService.writeIfVerbose("Filtering out packages from compile");
					sourceFiles = sourceFiles.filter(
						sourceFile => !isPackage(path.relative(process.cwd(), sourceFile.fileName)),
					);
				}

				if (projectOptions.json) {
					jsonReporter("startingCompile", { initial: true, count: sourceFiles.length });
				}

				const emitResult = compileFiles(program.getProgram(), data, pathTranslator, buildState, sourceFiles);

				for (const diagnostic of emitResult.diagnostics) {
					diagnosticReporter(diagnostic);
				}

				let containsErrors = false;
				if (hasErrors(emitResult.diagnostics)) {
					containsErrors = true;
					process.exitCode = 1;

					if (projectOptions.json) {
						jsonReporter("finishedCompileWithErrors", {
							errorCount: emitResult.diagnostics.length,
						});
					}
				} else if (projectOptions.json) {
					jsonReporter("finishedCompile", {});
				}

				// Build types
				if (!containsErrors) {
					buildTypes(data);
				}
			}
		} catch (e) {
			process.exitCode = 1;
			if (e instanceof LoggableError) {
				e.log();
				debugger;
			} else {
				throw e;
			}
		}
	},
});
