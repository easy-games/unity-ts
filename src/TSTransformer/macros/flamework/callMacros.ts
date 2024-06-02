import luau from "@roblox-ts/luau-ast";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { getFlameworkSymbolUid } from "TSTransformer/util/flameworkId";
import ts from "typescript";

export const FLAMEWORK_CALL_MACROS = {
	Dependency: (state, node) => {
		const firstArg = node.arguments[0];
		const firstType = node.typeArguments?.[0];

		if (firstArg && !firstType) {
			throw `Not supported!`;
		} else if (firstType && !firstArg) {
			if (firstType === undefined || !ts.isTypeReferenceNode(firstType)) {
				return luau.nil();
			}

			const symbol = state.services.macroManager.getSymbolFromNode(firstType.typeName);
			if (!symbol) return luau.nil();

			return luau.call(state.flamework!.Flamework("resolveDependency"), [
				luau.string(getFlameworkSymbolUid(state, symbol)),
			]);
		}

		throw `Not supported`;
	},
} satisfies MacroList<CallMacro>;
