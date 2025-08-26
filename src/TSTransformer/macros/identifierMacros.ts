import luau from "@roblox-ts/luau-ast";
import { errors, warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
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

	$SERVER: (state, node) => {
		if (!ts.isIfStatement(node.parent)) DiagnosticService.addDiagnostic(errors.directiveServerInvalid(node));

		if (state.isServerContext) {
			return luau.bool(true);
		} else if (state.isClientContext) {
			return luau.bool(false);
		} else {
			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: luau.id("Game"),
				name: "IsServer",
				args: luau.list.make(),
			});
		}
	},

	$CLIENT: (state, node) => {
		// DiagnosticService.addDiagnostic(errors.invalidServerMacroUse(node));

		if (!ts.isIfStatement(node.parent)) DiagnosticService.addDiagnostic(errors.directiveClientInvalid(node.parent));

		// return state.isServer ? true : state.isClient ? false  ? luau.call(luau.property(luau.id("Game"), "IsServer");
		if (state.isClientContext) {
			return luau.bool(true);
		} else if (state.isServerContext) {
			return luau.bool(false);
		} else {
			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: luau.id("Game"),
				name: "IsClient",
				args: luau.list.make(),
			});
		}
	},
};
