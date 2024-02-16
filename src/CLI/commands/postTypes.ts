import { getPackageJson } from "CLI/util/findTsConfigPath";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { ProjectOptions } from "Project";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";
import yargs from "yargs";

interface Flags {}

// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, Flags & Partial<ProjectOptions>>>({
	command: "postTypes",

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
		const packageJson = getPackageJson();
		const packageName: string = packageJson.name;
		rmSync(`temp`, {
			recursive: true,
			force: true,
		});
		const split = packageName.split("/");
		const typesPath = path.join("..", "..", "..", "Types~", split[0], split[1]);

		writeFileSync(path.join(typesPath, "index.d.ts"), "");

		// copy manually written d.ts files from source
		const checkDir = (dir: string) => {
			if (!existsSync(dir)) {
				return;
			}
			const files = readdirSync(dir, {
				withFileTypes: true,
			});
			for (const file of files) {
				if (file.name.includes(".d.ts")) {
					const sourcePath = path.join(dir, file.name);
					LogService.writeLine("copying " + sourcePath);

					const targetPath = sourcePath.replace("src" + path.sep, typesPath + path.sep);
					const targetPathDir = path.dirname(targetPath);
					if (!existsSync(targetPathDir)) {
						mkdirSync(targetPathDir);
					}
					copyFileSync(sourcePath, targetPath);
				}
			}
		};
		checkDir(path.join("src", "Server"));
		checkDir(path.join("src", "Client"));
		checkDir(path.join("src", "Shared"));
		checkDir(path.join("src", "Shared", "Types"));

		if (existsSync("flamework.build")) {
			copyFileSync("flamework.build", path.join(typesPath, "flamework.build"));
		}

		writeFileSync(
			path.join(typesPath, "package.json"),
			JSON.stringify(
				{
					name: packageJson.name,
					version: packageJson.version,
					types: "index.d.ts",
				},
				null,
				"\t",
			),
		);

		LogService.writeLine("Finished building types!");
	},
});
