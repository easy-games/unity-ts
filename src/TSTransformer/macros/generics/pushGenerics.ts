import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { isAirshipBehaviourType } from "TSTransformer/util/extendsAirshipBehaviour";
import ts from "typescript";

export interface MethodGenericInfo {
	parameters: Array<luau.AnyIdentifier>;
}

export interface GenericParameter {
	symbol: ts.Symbol;
	method: ts.MethodDeclaration;
	id: luau.AnyIdentifier;
	initializer: ts.Expression | undefined;
}

export function isGenericArgument(state: TransformState, node: ts.TypeNode) {

}

export function getGenericsForMethod(state: TransformState, node: ts.MethodDeclaration): MethodGenericInfo | undefined {
	const docs = ts.getJSDocTags(node);
	for (const doc of docs) {
		if (doc.tagName.text === "macro" && node.typeParameters) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.name);
			if (!symbol) return;

			const idList = new Array<GenericParameter>();
			if (!node.typeParameters) return undefined;

			for (const argument of node.typeParameters) {
				const constraint = argument.constraint;
				if (!constraint) continue;

				const typeOfCosntraint = state.typeChecker.getTypeAtLocation(constraint);
				if (!typeOfCosntraint) continue;
				if (!isAirshipBehaviourType(state, typeOfCosntraint, true)) continue;

				const idSymbol = state.typeChecker.getSymbolAtLocation(argument.name)!;
				console.log("add", idSymbol.id)
				idList.push({
					id: luau.tempId(argument.name.text),
					method: node,
					symbol: idSymbol,
					initializer: undefined,
				});
			}

			state.services.macroManager.registerMacroFunction(symbol, idList);
			return {
				parameters: idList.map(v => v.id),
			};
		}
	}
}
