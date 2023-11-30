import { TransformState } from "TSTransformer";
import { getInheritance } from "TSTransformer/util/airshipBehaviourUtils";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function extendsAirshipBehaviour(state: TransformState, node: ts.ClassLikeDeclaration) {
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
		const inheritance = getInheritance(state, type);
		if (inheritance.length < 2) {
			// always includes _self_ here.
			return false;
		}

		// Try getting the root declaration
		const baseTypeDeclaration = inheritance[inheritance.length - 1].valueDeclaration;
		if (baseTypeDeclaration !== undefined && ts.isClassLike(baseTypeDeclaration)) {
			const extendsNode = getExtendsNode(baseTypeDeclaration);
			if (!extendsNode) return false;

			const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
			return symbol === airshipBehaviourSymbol;
		}
	}

	return false;
}
