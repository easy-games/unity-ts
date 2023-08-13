import { findTsConfigPath, getPackageJson, getTsConfigProjectOptions } from "CLI/util/findTsConfigPath";
import { writeFileSync } from "fs-extra";
import { buildTypes } from "Project/functions/buildTypes";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude, copyNodeModules } from "Project/functions/copyInclude";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProjectData } from "Project/functions/createProjectData";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import { LogService } from "Shared/classes/LogService";
import { DEFAULT_PROJECT_OPTIONS, ProjectType } from "Shared/constants";
import { LoggableError } from "Shared/errors/LoggableError";
import { ProjectOptions } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import ts from "typescript";
import yargs from "yargs";

interface BuildFlags {
	project: string;
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, BuildFlags & Partial<ProjectOptions>>>({
	command: ["$0", "build"],

	describe: "Build a project",

	builder: {
		project: {
			alias: "p",
			string: true,
			default: ".",
			describe: "project path",
		},
		verbose: {
			boolean: true,
			describe: "enable verbose logs",
		},
		watch: {
			alias: "w",
			boolean: true,
			describe: "enable watch mode",
		},
		writeOnlyChanged: {
			alias: "writeOnlyChanged",
			boolean: true,
			describe: "enable to only write changed files",
		},
	},

	// builder: () =>
	// 	yargs
	// 		.option("project", {
	// 			alias: "p",
	// 			string: true,
	// 			default: ".",
	// 			describe: "project path",
	// 		})
	// 		// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
	// 		.option("watch", {
	// 			alias: "w",
	// 			boolean: true,
	// 			describe: "enable watch mode",
	// 		})
	// 		.option("usePolling", {
	// 			implies: "watch",
	// 			boolean: true,
	// 			describe: "use polling for watch mode",
	// 		})
	// 		.option("verbose", {
	// 			boolean: true,
	// 			describe: "enable verbose logs",
	// 		})
	// 		.option("noInclude", {
	// 			boolean: true,
	// 			describe: "do not copy include files",
	// 		})
	// 		.option("logTruthyChanges", {
	// 			boolean: true,
	// 			describe: "logs changes to truthiness evaluation from Lua truthiness rules",
	// 		})
	// 		.option("writeOnlyChanged", {
	// 			boolean: true,
	// 			hidden: true,
	// 		})
	// 		.option("optimizedLoops", {
	// 			boolean: true,
	// 			hidden: true,
	// 		})
	// 		.option("type", {
	// 			choices: [ProjectType.Game, ProjectType.Model, ProjectType.Package] as const,
	// 			describe: "override project type",
	// 		})
	// 		.option("includePath", {
	// 			alias: "i",
	// 			string: true,
	// 			describe: "folder to copy runtime files to",
	// 		})
	// 		.option("rojo", {
	// 			string: true,
	// 			describe: "manually select Rojo project file",
	// 		})
	// 		.option("allowCommentDirectives", {
	// 			boolean: true,
	// 			hidden: true,
	// 		}),

	handler: async argv => {
		try {
			const tsConfigPath = findTsConfigPath(argv.project);
			// const tsConfigPath = findTsConfigPath(".");

			// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
			const projectOptions: ProjectOptions = Object.assign(
				{},
				DEFAULT_PROJECT_OPTIONS,
				getTsConfigProjectOptions(tsConfigPath),
				argv,
			);

			LogService.verbose = projectOptions.verbose === true;

			const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

			const data = createProjectData(tsConfigPath, projectOptions);

			if (data.projectOptions.type === ProjectType.AirshipBundle) {
				const packageName = getPackageJson().name;
				writeFileSync(`../../../Types~/${packageName}/index.d.ts`, "");
			}

			if (projectOptions.watch) {
				setupProjectWatchProgram(data, projectOptions.usePolling);
			} else {
				const program = createProjectProgram(data);
				const pathTranslator = createPathTranslator(program, projectOptions);
				cleanup(pathTranslator, projectOptions);
				if (projectOptions.type !== ProjectType.AirshipBundle) {
					copyInclude(data);
					await copyNodeModules(data);
				}
				copyFiles(data, pathTranslator, new Set(getRootDirs(program.getCompilerOptions())));
				const emitResult = compileFiles(
					program.getProgram(),
					data,
					pathTranslator,
					getChangedSourceFiles(program),
				);
				for (const diagnostic of emitResult.diagnostics) {
					diagnosticReporter(diagnostic);
				}
				let containsErrors = false;
				if (hasErrors(emitResult.diagnostics)) {
					containsErrors = true;
					process.exitCode = 1;
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
