import { TransformState } from "TSTransformer/classes/TransformState";
import ts, { factory } from "typescript";

function isExclamationUnaryExpression(
	node: ts.Expression,
): node is ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken } {
	return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken;
}

export function isServerDirective(state: TransformState, node: ts.IfStatement) {
	const { isServerSymbol, isClientSymbol } = state.services.macroManager;

	if (isServerSymbol) {
		if (ts.isCallExpression(node.expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (isClientSymbol) {
		if (isExclamationUnaryExpression(node.expression) && ts.isCallExpression(node.expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression.operand.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (ts.isIdentifier(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$SERVER") === symbol;
	} else if (isExclamationUnaryExpression(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression.operand);
		if (!symbol) return false;
		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	}

	return false;
}

export function isEditorDirective(state: TransformState, node: ts.IfStatement) {
	const { isEditorSymbol } = state.services.macroManager;

	if (!isEditorSymbol) return false;
	if (ts.isCallExpression(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression.expression);
		if (!symbol) return false;
		return isEditorSymbol === symbol;
	}

	return false;
}

export function isClientDirective(state: TransformState, node: ts.IfStatement) {
	const { isClientSymbol, isServerSymbol } = state.services.macroManager;

	if (isClientSymbol) {
		if (ts.isCallExpression(node.expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (isServerSymbol) {
		if (isExclamationUnaryExpression(node.expression) && ts.isCallExpression(node.expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression.operand.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (ts.isIdentifier(node.expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
		if (!symbol) return false;

		return state.services.macroManager.getSymbolOrThrow("$CLIENT") === symbol;
	} else if (isExclamationUnaryExpression(node.expression)) {
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
	} else if (isEditorDirective(state, node)) {
		if (state.isPublish) {
			return node.elseStatement ?? false;
		} else {
			return node.thenStatement;
		}
	}

	return undefined;
}
