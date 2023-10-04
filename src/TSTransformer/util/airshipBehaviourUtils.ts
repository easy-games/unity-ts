import { TransformState } from "TSTransformer";
import ts from "typescript";

function isPrimitiveType(typeChecker: ts.TypeChecker, type: ts.Type) {
	return (
		type === typeChecker.getStringType() ||
		type === typeChecker.getNumberType() ||
		type === typeChecker.getBooleanType()
	);
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
