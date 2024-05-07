import path from "path";
import ts from "typescript";

export function getRootDirs(compilerOptions: ts.CompilerOptions): Array<string> {
	if (compilerOptions.rootDir !== undefined) {
		return [compilerOptions.rootDir];
	} else if (compilerOptions.rootDirs !== undefined && compilerOptions.rootDirs.length > 0) {
		return compilerOptions.rootDirs;
	}

	const rootDirs = [path.join(compilerOptions.baseUrl!)];
	return rootDirs;
}
