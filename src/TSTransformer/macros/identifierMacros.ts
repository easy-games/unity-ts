import luau from "@roblox-ts/luau-ast";
import { IdentifierMacro, MacroList } from "TSTransformer/macros/types";
import { isAirshipBehaviourClass } from "TSTransformer/util/extendsAirshipBehaviour";
import ts from "typescript";

export const IDENTIFIER_MACROS: MacroList<IdentifierMacro> = {
	Promise: (state, node) => state.TS(node, "Promise"),

	// Force the global gameObject to be the AirshipBehaviour one in a AirshipBehaviour ctx
	gameObject: (state, node) => {
		let parentNode: ts.Node | undefined = node.parent;
		while (parentNode) {
			if (ts.isClassLike(parentNode)) {
				if (isAirshipBehaviourClass(state, parentNode)) {
					return luau.property(luau.globals.self, "gameObject");
				}

				break;
			}

			parentNode = parentNode.parent;
		}

		return luau.id("gameObject");
	},
};
