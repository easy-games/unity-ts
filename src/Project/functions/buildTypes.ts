import fs from "fs-extra";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { LogService } from "Shared/classes/LogService";
import { ProjectData } from "Shared/types";
import ts from "typescript";

export function buildTypes(data: ProjectData) {
	LogService.writeLine("Building types...");

	fs.removeSync(`../../../Types~/${process.env.npm_package_name}`);

	const { fileNames, options } = getParsedCommandLine(data);
	const typesProgram = ts.createProgram(fileNames, {
		declaration: true,
		declarationDir: `../../../Types~/${process.env.npm_package_name}`,
		outDir: "temp",
	});
	typesProgram.emit();
	fs.removeSync("temp");
	fs.createFileSync(`../../../Types~/${process.env.npm_package_name}/index.d.ts`);
	LogService.writeLine("Finished building types!");
}
