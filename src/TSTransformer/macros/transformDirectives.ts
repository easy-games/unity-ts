import { TransformState } from "TSTransformer/classes/TransformState";
import ts, { factory } from "typescript";

export function isServerDirective(state: TransformState, node: ts.IfStatement) {
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

export function isClientDirective(state: TransformState, node: ts.IfStatement) {
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

export function isGuardClause(state: TransformState, node: ts.IfStatement) {
	if ((isServerDirective(state, node) || isClientDirective(state, node)) && isReturning(state, node.thenStatement)) {
		return true;
	}

	return false;
}

// function hasDirective(state: TransformState, expr: ts.Expression, check: (value: ts.Expression) => boolean) {
// 	if (
// 		ts.isBinaryExpression(expr) &&
// 		(check(expr.left) || check(expr.right) || hasDirective(state, expr.left, check))
// 	) {
// 		return true;
// 	}

// 	return false;
// }

// function extractDirective(state: TransformState, expr: ts.BinaryExpression) {
// 	if (ts.isIdentifier(expr.left) && state.services.macroManager.isDirectiveAtLocation(expr.left)) {
// 		return expr.left;
// 	} else if (ts.isIdentifier(expr.right) && state.services.macroManager.isDirectiveAtLocation(expr.right)) {
// 		return expr.left;
// 	}

// 	return undefined;
// }

export function transformDirectiveIfStatement(
	state: TransformState,
	node: ts.IfStatement,
	ignoreGuard = false,
): ts.Statement | false | undefined {
	if (isGuardClause(state, node) && !ignoreGuard) {
		return undefined;
	}

	if (isServerDirective(state, node)) {
		// we're in contextual mode
		if (state.isServerContext) {
			return node.thenStatement;
		} else {
			return node.elseStatement ?? false;
		}
	} else if (isClientDirective(state, node)) {
		// we're in contextual mode
		if (state.isClientContext) {
			return node.thenStatement;
		} else {
			return node.elseStatement ?? false;
		}
	}

	// if (
	// 	ts.isBinaryExpression(node.expression) &&
	// 	hasDirective(
	// 		state,
	// 		node.expression,
	// 		v => ts.isIdentifier(v) && state.services.macroManager.isDirectiveAtLocation(v),
	// 	)
	// ) {
	// 	// return transformWithDirective(state, node);
	// }

	return undefined;
}
