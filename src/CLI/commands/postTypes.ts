import { getPackageJson } from "CLI/util/findTsConfigPath";
import { rmSync, writeFileSync } from "fs";
import { ProjectOptions } from "Project";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";
import yargs from "yargs";

interface Flags {}

// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, Flags & Partial<ProjectOptions>>>({
	command: ["$0", "postTypes"],

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
		const packageName: string = getPackageJson().name;
		rmSync(`temp`, {
			recursive: true,
			force: true,
		});
		writeFileSync(`../../../Types~/${packageName}/index.d.ts`, "");
		LogService.writeLine("Finished building types!");
	},
});
