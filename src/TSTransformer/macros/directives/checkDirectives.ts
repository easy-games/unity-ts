import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

function isExclamationUnaryExpression(
	node: ts.Expression,
): node is ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken } {
	return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken;
}

export function isNotClientDirective(state: TransformState, expression: ts.Expression) {
	const { isServerSymbol, isClientSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return $CLIENT === symbol;
	}
}

export function isNotServerDirective(state: TransformState, expression: ts.Expression) {
	const { isServerSymbol, isClientSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isExclamationUnaryExpression(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
		if (!symbol) return false;
		return $SERVER === symbol;
	}
}

export function isServerDirective(state: TransformState, expression: ts.Expression) {
	const { isServerSymbol, isClientSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isServerSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isServerSymbol === symbol;
		}
	}

	// if (isClientSymbol) {
	// 	if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
	// 		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
	// 		if (!symbol) return false;
	// 		return isClientSymbol === symbol;
	// 	}
	// }

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return $SERVER === symbol;
	}

	// if (isExclamationUnaryExpression(expression)) {
	// 	const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
	// 	if (!symbol) return false;
	// 	return $CLIENT === symbol;
	// }

	return false;
}

export function isClientDirective(state: TransformState, expression: ts.Expression) {
	const { isClientSymbol, isServerSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isClientSymbol) {
		if (ts.isCallExpression(expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression);
			if (!symbol) return false;
			return isClientSymbol === symbol;
		}
	}

	// if (isServerSymbol) {
	// 	if (isExclamationUnaryExpression(expression) && ts.isCallExpression(expression.operand)) {
	// 		const symbol = state.typeChecker.getSymbolAtLocation(expression.operand.expression);
	// 		if (!symbol) return false;
	// 		return isServerSymbol === symbol;
	// 	}
	// }

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		if (!symbol) return false;

		return $CLIENT === symbol;
	}

	// if (isExclamationUnaryExpression(expression)) {
	// 	const symbol = state.typeChecker.getSymbolAtLocation(expression.operand);
	// 	if (!symbol) return false;
	// 	return $SERVER === symbol;
	// }

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
