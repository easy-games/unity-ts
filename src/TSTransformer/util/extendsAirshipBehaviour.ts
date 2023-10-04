import { TransformState } from "TSTransformer";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts, { ModifierFlags } from "typescript";

export function extendsAirshipBehaviour(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol) {
			const isDefault = (node.modifierFlagsCache & ModifierFlags.Default) !== 0;
			const isExport = (node.modifierFlagsCache & ModifierFlags.Export) !== 0;
			return (
				isDefault &&
				isExport &&
				symbol === state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow()
			);
		}
	}

	return false;
}
