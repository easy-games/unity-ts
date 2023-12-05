import { TransformState } from "TSTransformer";
import { getAncestorTypeSymbols } from "TSTransformer/util/airshipBehaviourUtils";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function isRootAirshipBehaviourClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}
	}

	return false;
}

export function isAirshipBehaviourClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

		// check if the immediate extends is AirshipBehaviour
		const type = state.typeChecker.getTypeAtLocation(node);
		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}

		// Get the inheritance tree, otherwise
		const inheritance = getAncestorTypeSymbols(state, type);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 1];
		if (baseTypeDeclaration !== undefined) {
			return baseTypeDeclaration === airshipBehaviourSymbol;
		}
	}

	return false;
}
