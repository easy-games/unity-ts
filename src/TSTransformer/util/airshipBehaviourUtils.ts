import { TransformState } from "TSTransformer";
import ts from "typescript";

export function isPublicWritablePropertyDeclaration(node: ts.PropertyDeclaration) {
	// If no modifiers, then it's public by default anyway
	if (!node.modifiers) return true;
	const isPrivateOrProtected = node.modifiers.some(
		f =>
			f.kind === ts.SyntaxKind.PrivateKeyword ||
			f.kind === ts.SyntaxKind.ProtectedKeyword ||
			f.kind === ts.SyntaxKind.ReadonlyKeyword ||
			f.kind === ts.SyntaxKind.StaticKeyword,
	);

	return !isPrivateOrProtected;
}

export function getAllTypes(type: ts.Type) {
	if (type.isIntersection()) {
		return type.types;
	} else {
		return [type];
	}
}

export function getAncestorTypeSymbols(state: TransformState, nodeType: ts.Type) {
	// ensure non-nullable (e.g. if `GameObject | undefined` - make `GameObject`)
	if (nodeType.isNullableType()) {
		nodeType = nodeType.getNonNullableType();
	}

	const baseTypes = nodeType.getBaseTypes();
	if (baseTypes) {
		const symbols = new Array<ts.Symbol>();
		for (const baseType of baseTypes) {
			symbols.push(baseType.symbol);

			for (const parentSymbol of getAncestorTypeSymbols(state, baseType)) {
				symbols.push(parentSymbol);
			}
		}
		return symbols;
	} else {
		return [];
	}
}

export function isUnityObjectType(state: TransformState, nodeType: ts.Type) {
	const objectSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("Object");

	const objectInheritanceTree = getAncestorTypeSymbols(state, nodeType);
	return objectInheritanceTree.includes(objectSymbol);
}

export function isValidAirshipBehaviourExportType(state: TransformState, node: ts.Node) {
	const nodeType = state.getType(node);
	if (state.typeChecker.isArrayType(nodeType)) {
		const innerArrayType = state.typeChecker.getElementTypeOfArrayType(nodeType)!;
		return (
			state.services.airshipSymbolManager.isTypeSerializable(innerArrayType) ||
			isUnityObjectType(state, innerArrayType)
		);
	} else {
		return state.services.airshipSymbolManager.isTypeSerializable(nodeType) || isUnityObjectType(state, nodeType);
	}
}
