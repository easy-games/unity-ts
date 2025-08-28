import { TransformState } from "TSTransformer/classes/TransformState";
import ts, { factory } from "typescript";

function isExclamationUnaryExpression(
	node: ts.Expression,
): node is ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken } {
	return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken;
}

function isServerDirective(state: TransformState, expression: ts.Expression) {
	const { isServerSymbol, isClientSymbol } = state.services.macroManager;

	if (isServerSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (isClientSymbol) {
		if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$SERVER") === symbol;
	} else if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	}

	return false;
}

function isClientDirective(state: TransformState, expression: ts.Expression) {
	const { isClientSymbol, isServerSymbol } = state.services.macroManager;

	if (isClientSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (isServerSymbol) {
		if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	} else if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return state.services.macroManager.getSymbolOrThrow("$SERVER") === symbol;
	}

	return false;
}

export function isClientIfDirective(state: TransformState, node: ts.IfStatement) {
	return isClientDirective(state, node.expression);
}

export function isServerIfDirective(state: TransformState, node: ts.IfStatement) {
	if (
		ts.isBinaryExpression(node.expression) &&
		node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
	) {
		return isServerDirective(state, node.expression.left) || isServerDirective(state, node.expression.right);
	}

	return isServerDirective(state, node.expression);
}

export function isEditorIfDirective(state: TransformState, node: ts.IfStatement) {
	const { isEditorSymbol } = state.services.macroManager;

	if (!isEditorSymbol) return false;
	if (ts.isCallExpression(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression.expression);
		if (!symbol) return false;
		return isEditorSymbol === symbol;
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

function isThrowing(state: TransformState, statement: ts.Statement) {
	if (ts.isBlock(statement)) {
		return ts.isThrowStatement(statement.statements[statement.statements.length - 1]);
	} else if (ts.isThrowStatement(statement)) {
		return true;
	}

	return false;
}

// if returns or throws early
export function isGuardClause(state: TransformState, node: ts.IfStatement) {
	if (
		(isServerIfDirective(state, node) || isClientIfDirective(state, node)) &&
		(isReturning(state, node.thenStatement) || isThrowing(state, node.thenStatement))
	) {
		return true;
	}

	return false;
}

export function transformThenStatement(state: TransformState, node: ts.IfStatement) {
	if (ts.isBinaryExpression(node.expression)) {
		if (isServerDirective(state, node.expression.left)) {
			return factory.updateIfStatement(node, node.expression.right, node.thenStatement, node.elseStatement);
		} else if (isServerDirective(state, node.expression.right)) {
			return factory.updateIfStatement(node, node.expression.left, node.thenStatement, node.elseStatement);
		}
	}

	return node.thenStatement;
}

export function transformElseStatement(state: TransformState, node: ts.IfStatement) {
	return node.elseStatement ?? false;
}

export function transformDirectiveIfStatement(
	state: TransformState,
	node: ts.IfStatement,
	ignoreGuard = false,
): ts.Statement | false | undefined {
	if (isGuardClause(state, node) && !ignoreGuard) {
		return undefined;
	}

	if (isServerIfDirective(state, node)) {
		// we're in contextual mode
		if (state.isServerContext) {
			return transformThenStatement(state, node);
		} else {
			return transformElseStatement(state, node); // node.elseStatement ?? false;
		}
	} else if (isClientIfDirective(state, node)) {
		// we're in contextual mode
		if (state.isClientContext) {
			return transformThenStatement(state, node);
		} else {
			return transformElseStatement(state, node); //node.elseStatement ?? false;
		}
	} else if (isEditorIfDirective(state, node)) {
		if (state.isPublish) {
			return transformElseStatement(state, node); //node.elseStatement ?? false;
		} else {
			return transformThenStatement(state, node);
		}
	}

	return undefined;
}
