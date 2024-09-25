import luau from "@roblox-ts/luau-ast";
import { MacroList, PropertyGetMacro, PropertySetMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyAccessExpression } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

export const PROPERTY_GETTERS = {
	AirshipBehaviour: {},
} satisfies { [className: string]: MacroList<PropertyGetMacro> };
export const PROPERTY_SETTERS = {
	AirshipBehaviour: {
		enabled: (state, node, value) => {
			return luau.list.make<luau.Statement>(
				luau.comment("▼ set 'enabled' ▼"),
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
						name: "set_enabled",
						expression: convertToIndexableExpression(transformExpression(state, node.expression)),
						args: luau.list.make(value),
					}),
				}),
				luau.comment("▲ set 'enabled' ▲"),
			);
		},
	},
} satisfies { [className: string]: MacroList<PropertySetMacro> };
