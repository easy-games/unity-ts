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
