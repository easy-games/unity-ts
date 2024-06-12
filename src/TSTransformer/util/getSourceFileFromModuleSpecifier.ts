import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.Expression) {
	const symbol = state.typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		const declaration = symbol.valueDeclaration;

		if (declaration && ts.isModuleDeclaration(declaration) && ts.isStringLiteralLike(declaration.name)) {
			const sourceFile = moduleSpecifier.getSourceFile();
			const mode = ts.getModeForUsageLocation(sourceFile, declaration.name, state.compilerOptions);
			const resolvedModuleInfo = state.program.getResolvedModule(sourceFile, declaration.name.text, mode);
			if (resolvedModuleInfo && resolvedModuleInfo.resolvedModule) {
				return state.program.getSourceFile(resolvedModuleInfo.resolvedModule.resolvedFileName);
			}
		}

		assert(declaration && ts.isSourceFile(declaration));
		return declaration;
	}
}
