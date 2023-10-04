import { TransformState } from "TSTransformer";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function extendsAirshipBehaviour(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol) {
			return symbol === state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();
		}
	}

	return false;
}
