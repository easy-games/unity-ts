import { findTsConfigPath, getPackageJson, getTsConfigProjectOptions } from "CLI/util/findTsConfigPath";
import { existsSync, mkdirSync } from "fs";
import { writeFileSync } from "fs-extra";
import path from "path";
import { buildTypes } from "Project/functions/buildTypes";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyNodeModules } from "Project/functions/copyInclude";
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
	command: "build",

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

			LogService.verbose = projectOptions.verbose === true;

			const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

			const data = createProjectData(tsConfigPath, projectOptions);

			if (data.projectOptions.type === ProjectType.AirshipBundle) {
				const json = getPackageJson();
				const split = json.name.split("/");
				const indexPath = path.join("..", "..", "..", "Types~", split[0], split[1], "index.d.ts");
				const indexPathDir = path.dirname(indexPath);
				if (!existsSync(indexPathDir)) {
					mkdirSync(indexPathDir, {
						recursive: true,
					});
				}
				writeFileSync(indexPath, "");
			}

			if (projectOptions.watch) {
				setupProjectWatchProgram(data, projectOptions.usePolling);
			} else {
				const program = createProjectProgram(data);
				const pathTranslator = createPathTranslator(program, projectOptions);
				cleanup(pathTranslator, projectOptions);
				if (projectOptions.type === ProjectType.Game) {
					// copyInclude(data);
				}
				if (projectOptions.copyNodeModules) {
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
