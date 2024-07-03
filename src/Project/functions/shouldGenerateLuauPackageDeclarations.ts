import path from "path";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectOptions } from "Shared/types";
import ts from "typescript";

export function shouldGenerateLuauPackageDeclarations(
	pathTranslator: PathTranslator,
	compilerOptions: ts.CompilerOptions,
	projectOptions: ProjectOptions,
	sourceFile: ts.SourceFile,
) {
	if (compilerOptions.declaration === true) {
		const relativePath = path.relative(pathTranslator.rootDir, sourceFile.fileName).split(path.sep);

		if (relativePath[0] !== "AirshipPackages") {
			return false;
		}

		const packageScope = relativePath[1] + "/" + relativePath[2];
		return projectOptions.luauPackages.includes(packageScope);
	}

	return false;
}
