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

export function getInheritance(state: TransformState, nodeType: ts.Type) {
	// ensure non-nullable (e.g. if `GameObject | undefined` - make `GameObject`)
	if (nodeType.isNullableType()) {
		nodeType = nodeType.getNonNullableType();
	}

	const baseTypes = nodeType.getBaseTypes();

	console.log(
		"TYPES",
		state.typeChecker.typeToString(nodeType),
		baseTypes?.map(v => state.typeChecker.typeToString(v)).join(", "),
	);

	if (baseTypes) {
		return [nodeType.symbol, ...baseTypes.map(type => type.symbol)];
	} else {
		return [nodeType.symbol];
	}
}

export function isUnityObjectType(state: TransformState, nodeType: ts.Type) {
	const objectSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("Object");

	const objectInheritanceTree = getInheritance(state, nodeType);
	return objectInheritanceTree.includes(objectSymbol);
}

export function isValidAirshipBehaviourExportType(state: TransformState, node: ts.Node) {
	const nodeType = state.getType(node);
	return state.services.airshipSymbolManager.isTypeSerializable(nodeType);
}
