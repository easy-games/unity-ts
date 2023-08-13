import { getPackageJson } from "CLI/util/findTsConfigPath";
import { rmSync } from "fs";
import path from "path";
import { ProjectOptions } from "Project";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";
import yargs from "yargs";

interface Flags {}

// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, Flags & Partial<ProjectOptions>>>({
	command: ["$0", "prepareTypes"],

	handler: async argv => {
		LogService.writeLine("Building types...");

		const packageJson = getPackageJson();
		const packageName = path.basename(packageJson.name);
		rmSync(`../../../Types~/${packageName}`, {
			recursive: true,
			force: true,
		});
	},
});
