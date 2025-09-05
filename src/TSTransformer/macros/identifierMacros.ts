import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { IdentifierMacro, MacroList } from "TSTransformer/macros/types";
import { isAirshipBehaviourClass } from "TSTransformer/util/extendsAirshipBehaviour";
import ts from "typescript";

function isValidDirectiveParent(node: ts.Node) {
	return ts.isIfStatement(node);
}

function validateDirective(state: TransformState, node: ts.Identifier, directive: "$SERVER" | "$CLIENT") {
	if (DiagnosticService.hasErrors()) return false;

	if (ts.isBinaryExpression(node.parent) && ts.isConditionalExpression(node.parent.parent)) {
		DiagnosticService.addDiagnostic(
			errors.invalidDirectiveUsageWithConditionalExpression(node.parent, directive, node.parent.parent),
		);
		return false;
	}

	if (!isValidDirectiveParent(node.parent) /* && !state.isSharedContext */) {
		if (ts.isBinaryExpression(node.parent)) {
			DiagnosticService.addDiagnostic(
				errors.invalidDirectiveUsageWithBinaryExpression(node, directive, node.parent),
			);
		} else {
			DiagnosticService.addDiagnostic(errors.invalidDirectiveUsage(node, directive));
		}

		return false;
	}

	return true;
}

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
		if (!validateDirective(state, node, "$SERVER")) return luau.nil();

		if (state.isServerContext) {
			return luau.bool(true);
		} else if (state.isClientContext) {
			return luau.bool(false);
		} else {
			const id = state.addFileImport("AirshipPackages/@Easy/Core/Shared/Game", "Game");
			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: id,
				name: "IsServer",
				args: luau.list.make(),
			});
		}
	},

	$CLIENT: (state, node) => {
		if (!validateDirective(state, node, "$CLIENT")) return luau.nil();

		// return state.isServer ? true : state.isClient ? false  ? luau.call(luau.property(luau.id("Game"), "IsServer");
		if (state.isClientContext) {
			return luau.bool(true);
		} else if (state.isServerContext) {
			return luau.bool(false);
		} else {
			const id = state.addFileImport("AirshipPackages/@Easy/Core/Shared/Game", "Game");
			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: id,
				name: "IsClient",
				args: luau.list.make(),
			});
		}
	},
};
