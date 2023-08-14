import { getPackageJson } from "CLI/util/findTsConfigPath";
import { existsSync, rmSync } from "fs";
import path from "path";
import { ProjectOptions } from "Project";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";
import yargs from "yargs";

interface Flags {}

// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, Flags & Partial<ProjectOptions>>>({
	command: "prepareTypes",

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
		LogService.writeLine("Building types...");

		const packageJson = getPackageJson();
		const packageName = path.basename(packageJson.name);

		const typesPath = path.join("..", "..", "..", "Types~", packageName);
		if (existsSync(typesPath)) {
			rmSync(typesPath, {
				recursive: true,
				force: true,
			});
		}
	},
});
