import luau from "@roblox-ts/luau-ast";
import { Transform } from "stream";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import ts from "typescript";

export function containsServerCheckDirective(state: TransformState, node: ts.IfStatement) {
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

export function containsClientCheckDirective(state: TransformState, node: ts.IfStatement) {
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

function isReturning(state: TransformState, statement: ts.Statement) {
	if (ts.isBlock(statement)) {
		return ts.isReturnStatement(statement.statements[statement.statements.length - 1]);
	} else if (ts.isReturnStatement(statement)) {
		return true;
	}

	return false;
}

function getReturn(state: TransformState, statement: ts.Statement) {
	if (!isReturning(state, statement)) return;

	if (ts.isBlock(statement)) {
		const last = statement.statements[statement.statements.length - 1];
		if (ts.isReturnStatement(last)) {
			return last;
		}
	} else if (ts.isReturnStatement(statement)) {
		return statement;
	}

	return false;
}

export function isGuardClause(state: TransformState, node: ts.IfStatement) {
	if (
		(containsServerCheckDirective(state, node) || containsClientCheckDirective(state, node)) &&
		isReturning(state, node.thenStatement)
	) {
		return true;
	}

	return false;
}

export function transformDirectiveIfStatement(
	state: TransformState,
	node: ts.IfStatement,
	ignoreGuard = false,
): ts.Statement | false | undefined {
	if (isGuardClause(state, node) && !ignoreGuard) {
		state.pushEarlyReturn(node);

		return;
		//return node.thenStatement;
	}

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
