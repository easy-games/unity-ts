import fs from "fs-extra";
import path from "path";
import { getChangedFilePaths } from "Project/functions/getChangedFilePaths";
import { getPackageDirectories } from "Project/functions/getPackageDirectories";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";

function getPrecompiledDirectories(packageDirs: ReadonlyArray<string>) {
	return packageDirs.filter(packageDirPath => fs.existsSync(path.join(packageDirPath, ".precompiled")));
}

export function getChangedSourceFiles(program: ts.BuilderProgram, pathHints?: Array<string>) {
	const ignorePackageDirectories = getPrecompiledDirectories(getPackageDirectories(program));

	if (LogService.verbose) {
		LogService.writeIfVerbose(
			"Skipping directories: " +
				ignorePackageDirectories.map(f => path.relative(program.getCurrentDirectory(), f)).join(", "),
		);
	}

	const sourceFiles = new Array<ts.SourceFile>();
	eachFile: for (const fileName of getChangedFilePaths(program, pathHints)) {
		for (const packageDirectory of ignorePackageDirectories) {
			if (fileName.startsWith(packageDirectory)) continue eachFile;
		}

		const sourceFile = program.getSourceFile(fileName);
		if (sourceFile && !sourceFile.isDeclarationFile /*&& !ts.isJsonSourceFile(sourceFile)*/) {
			sourceFiles.push(sourceFile);
		}
	}
	return sourceFiles;
}
