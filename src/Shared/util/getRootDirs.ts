import { ProjectOptions } from "Shared/types";
import ts from "typescript";

export function getRootDirs(compilerOptions: ts.CompilerOptions, projectOptions: ProjectOptions): Array<string> {
	if (compilerOptions.rootDir !== undefined) {
		return [compilerOptions.rootDir];
	} else if (compilerOptions.rootDirs !== undefined && compilerOptions.rootDirs.length > 0) {
		return compilerOptions.rootDirs;
	}

	const base = compilerOptions.baseUrl ?? process.cwd();
	return [base];
}
