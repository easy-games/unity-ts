import path from "path";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectOptions } from "Shared/types";
import { findAncestorDir } from "Shared/util/findAncestorDir";
import { getRootDirs } from "Shared/util/getRootDirs";
import ts from "typescript";

export function createPathTranslator(program: ts.BuilderProgram, projectOptions: ProjectOptions) {
	const compilerOptions = program.getCompilerOptions();
	const rootDir = findAncestorDir([program.getProgram().getCommonSourceDirectory(), ...getRootDirs(compilerOptions)]);
	const outDir = compilerOptions.outDir!;
	let buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(compilerOptions);
	if (buildInfoPath !== undefined) {
		buildInfoPath = path.normalize(buildInfoPath);
	}
	const declaration = compilerOptions.declaration === true;
	return new PathTranslator(rootDir, outDir, buildInfoPath, declaration, projectOptions);
}
