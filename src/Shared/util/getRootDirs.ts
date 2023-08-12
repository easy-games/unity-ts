import path from "path";
import ts from "typescript";

export function getRootDirs(compilerOptions: ts.CompilerOptions): Array<string> {
	if (compilerOptions.rootDir !== undefined) {
		return [compilerOptions.rootDir];
	} else if (compilerOptions.rootDirs !== undefined) {
		return compilerOptions.rootDirs;
	}
	const rootDirs = [
		path.join(compilerOptions.baseUrl!, "Server"),
		path.join(compilerOptions.baseUrl!, "Client"),
		path.join(compilerOptions.baseUrl!, "Shared"),
	];
	return rootDirs;
}
