import { TransformState } from "TSTransformer";
import ts from "typescript";

function isPrimitiveType(typeChecker: ts.TypeChecker, type: ts.Type) {
	return (
		type === typeChecker.getStringType() ||
		type === typeChecker.getNumberType() ||
		type === typeChecker.getBooleanType()
	);
}

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

export function isValidAirshipBehaviourExportType(state: TransformState, node: ts.Node) {
	const nodeType = state.getType(node);
	return isPrimitiveType(state.typeChecker, nodeType); // TODO: Complex types later.
}
