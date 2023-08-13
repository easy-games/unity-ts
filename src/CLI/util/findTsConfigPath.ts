import { CLIError } from "CLI/errors/CLIError";
import fs from "fs";
import path from "path";
import { ProjectOptions } from "Project";
import ts from "typescript";

export function findTsConfigPath(projectPath: string) {
	let tsConfigPath: string | undefined = path.resolve(projectPath);
	if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
		tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new CLIError("Unable to find tsconfig.json!");
		}
	}
	return path.resolve(process.cwd(), tsConfigPath);
}

export function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			const t = ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
			return t;
		}
	}
}

export function getPackageJson() {
	const path = "./package.json";
	const rawJson = ts.sys.readFile("./package.json");
	return JSON.parse(rawJson!);
}
