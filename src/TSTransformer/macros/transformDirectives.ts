import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import ts from "typescript";

function containsServerCheckDirective(state: TransformState, node: ts.IfStatement) {
	if (ts.isIdentifier(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$SERVER") === symbol;
	} else if (
		ts.isPrefixUnaryExpression(node.expression) &&
		node.expression.operator === ts.SyntaxKind.ExclamationToken
	) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression.operand);
		if (!symbol) return false;
		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	}

	return false;
}

function containsClientCheckDirective(state: TransformState, node: ts.IfStatement) {
	if (ts.isIdentifier(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	} else if (
		ts.isPrefixUnaryExpression(node.expression) &&
		node.expression.operator === ts.SyntaxKind.ExclamationToken
	) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression.operand);
		if (!symbol) return false;
		return state.services.macroManager.getSymbolOrThrow("$SERVER") === symbol;
	}

	return false;
}

export function transformDirectiveIfStatement(
	state: TransformState,
	node: ts.IfStatement,
): ts.Statement | false | undefined {
	if (containsServerCheckDirective(state, node)) {
		// we're in contextual mode
		if (state.isServerContext) {
			return node.thenStatement;
		} else {
			return node.elseStatement ?? false;
		}
	} else if (containsClientCheckDirective(state, node)) {
		// we're in contextual mode
		if (state.isClientContext) {
			return node.thenStatement;
		} else {
			return node.elseStatement ?? false;
		}
	}
}
