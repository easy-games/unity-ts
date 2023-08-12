import fs from "fs-extra";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { LogService } from "Shared/classes/LogService";
import { ProjectType } from "Shared/constants";
import { ProjectData, ProjectOptions } from "Shared/types";
import ts from "typescript";

function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			const t = ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
			return t;
		}
	}
}

export function buildTypes(data: ProjectData) {
	if (data.projectOptions.type !== ProjectType.Game && data.projectOptions.type !== ProjectType.AirshipBundle) {
		LogService.writeLine("Skipping types build.");
		return;
	}

	LogService.writeLine("Building types...");

	fs.removeSync(`../../../Types~/${process.env.npm_package_name}`);

	// const projectOptions: ProjectOptions = Object.assign(
	// 	{},
	// 	DEFAULT_PROJECT_OPTIONS,
	// 	getTsConfigProjectOptions(tsConfigPath),
	// 	argv,
	// );

	const { fileNames, options } = getParsedCommandLine(data);
	const typesProgram = ts.createProgram(fileNames, {
		declaration: true,
		declarationDir: `../../../Types~/${process.env.npm_package_name}`,
		outDir: "temp",
		rootDirs: ["src/Server", "src/Shared", "src/Server"],
		plugins: [{ name: "typescript-transform-paths" }],
	});
	typesProgram.emit();
	fs.removeSync("temp");
	fs.createFileSync(`../../../Types~/${process.env.npm_package_name}/index.d.ts`);
	LogService.writeLine("Finished building types!");
}
