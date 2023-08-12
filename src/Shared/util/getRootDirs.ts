import path from "path";
import ts from "typescript";

export function getRootDirs(compilerOptions: ts.CompilerOptions) {
	// const rootDirs = compilerOptions.rootDir ? [compilerOptions.rootDir] : compilerOptions.rootDirs;
	// assert(rootDirs);
	// return rootDirs;
	const rootDirs = [
		path.join(compilerOptions.baseUrl!, "Server"),
		path.join(compilerOptions.baseUrl!, "Client"),
		path.join(compilerOptions.baseUrl!, "Shared"),
	];
	return rootDirs;
}
