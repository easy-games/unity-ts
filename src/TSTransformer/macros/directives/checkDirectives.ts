import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

function isExclamationUnaryExpression(
	node: ts.Expression,
): node is ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken } {
	return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken;
}

export function isNotClientDirective(state: TransformState, expression: ts.Expression, includeImplicitCalls: boolean) {
	const { isClientSymbol, $CLIENT } = state.services.macroManager;

	if (includeImplicitCalls && isClientSymbol) {
		if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return $CLIENT === symbol;
	}
}

export function isNotServerDirective(state: TransformState, expression: ts.Expression, includeImplicitCalls: boolean) {
	const { isServerSymbol, $SERVER } = state.services.macroManager;

	if (includeImplicitCalls && isServerSymbol) {
		if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return $SERVER === symbol;
	}
}

export function isServerDirective(state: TransformState, expression: ts.Expression, includeImplicitCalls: boolean) {
	const { isServerSymbol, $SERVER } = state.services.macroManager;

	if (includeImplicitCalls && isServerSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return $SERVER === symbol;
	}

	return false;
}

export function isClientDirective(state: TransformState, expression: ts.Expression, includeImplicitCalls: boolean) {
	const { isClientSymbol, $CLIENT } = state.services.macroManager;

	if (includeImplicitCalls && isClientSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return $CLIENT === symbol;
	}

	return false;
}

/**
 * @deprecated
 */
export function isClientIfDirective(state: TransformState, node: ts.IfStatement) {
	return isClientDirective(state, node.expression, true);
}

/**
 * @deprecated
 */
export function isServerIfDirective(state: TransformState, node: ts.IfStatement) {
	if (
		ts.isBinaryExpression(node.expression) &&
		node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
	) {
		return (
			isServerDirective(state, node.expression.left, true) ||
			isServerDirective(state, node.expression.right, true)
		);
	}

	return isServerDirective(state, node.expression, true);
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
