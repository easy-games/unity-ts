import ts from "typescript";

export function isAmbientOrTypeOnlyModule(typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile) {
	const symbol = typeChecker.getSymbolAtLocation(sourceFile);

	if (symbol && symbol.exports && symbol.exports.size > 0) {
		for (const [, symbolExport] of symbol.exports) {
			const value = symbolExport.valueDeclaration ?? symbolExport.declarations?.[0];
			if (!value) return false; // to be safe

			const isAmbient = (value.flags & ts.NodeFlags.Ambient) !== 0;
			const isTypeLike =
				(value.flags & ts.SymbolFlags.Interface) !== 0 || (value.flags & ts.SymbolFlags.TypeAlias) !== 0;

			if (!isAmbient && !isTypeLike) {
				return false;
			}
		}

		return true;
	}

	return false;
}
