import luau from "@roblox-ts/luau-ast";
import { MacroList, PropertyGetMacro, PropertySetMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

export const AirshipBehaviourReservedId = {
	set_enabled: luau.id("set_enabled"),
	gameObject: luau.id("gameObject"),
	transform: luau.id("transform"),
	enabled: luau.id("enabled"),
} satisfies { [name: string]: luau.Identifier };

export const PROPERTY_GETTERS = {
	AirshipBehaviour: {},
} satisfies { [className: string]: MacroList<PropertyGetMacro> };
export const PROPERTY_SETTERS = {
	AirshipBehaviour: {
		enabled: (state, node, value) => {
			return luau.list.make<luau.Statement>(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
						name: AirshipBehaviourReservedId.set_enabled.name,
						expression: convertToIndexableExpression(transformExpression(state, node.expression)),
						args: luau.list.make(value),
					}),
				}),
			);
		},
	},
} satisfies { [className: string]: MacroList<PropertySetMacro> };

export function isAirshipBehaviourReserved(name: string) {
	return name in AirshipBehaviourReservedId;
}
