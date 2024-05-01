import chalk from "chalk";
import { findTsConfigPath, getPackageJson, getTsConfigProjectOptions } from "CLI/util/findTsConfigPath";
import { existsSync, mkdirSync } from "fs";
import { writeFileSync } from "fs-extra";
import kleur from "kleur";
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
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectOptions } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import { AirshipBuildState } from "TSTransformer";
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
		json: {
			alias: "E",
			hidden: true,
			boolean: true,
			default: false,
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
			const packageJson = getPackageJson();

			// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
			const projectOptions: ProjectOptions = Object.assign(
				{},
				DEFAULT_PROJECT_OPTIONS,
				getTsConfigProjectOptions(tsConfigPath),
				argv,
			);

			LogService.verbose = projectOptions.verbose === true && !argv.json;

			if (projectOptions.json && projectOptions.verbose) {
				// In future we're gonna auto-upgrade here, we want this frictionless
				throw new ProjectError(`json mode cannot be used with --verbose flag`);
			}

			const compilerTsVersion = new ts.Version(ts.version);
			const projectTsVersionRange = new ts.VersionRange(packageJson.devDependencies["typescript"]);

			if (!projectTsVersionRange.test(compilerTsVersion)) {
				// In future we're gonna auto-upgrade here, we want this frictionless
				throw new ProjectError(
					`Project TypeScript version range is ${projectTsVersionRange.toString()}, compiler ts version is ${compilerTsVersion}`,
				);
			}

			const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

			const data = createProjectData(tsConfigPath, projectOptions);

			if (data.projectOptions.type === ProjectType.AirshipBundle) {
				const split = packageJson.name.split("/");
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
					new AirshipBuildState(),
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
