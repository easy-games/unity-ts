import { TransformState } from "TSTransformer/classes/TransformState";
import ts, { factory } from "typescript";

function isExclamationUnaryExpression(
	node: ts.Expression,
): node is ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken } {
	return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken;
}

function isServerDirective(state: TransformState, expression: ts.Expression) {
	const { isServerSymbol, isClientSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isServerSymbol) {
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

	if (isClientSymbol) {
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

	return false;
}

function isClientDirective(state: TransformState, expression: ts.Expression) {
	const { isClientSymbol, isServerSymbol, $CLIENT, $SERVER } = state.services.macroManager;

	if (isClientSymbol) {
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

	if (isServerSymbol) {
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
		return (
			statement.statements.length > 0 &&
			ts.isReturnStatement(statement.statements[statement.statements.length - 1])
		);
	} else if (ts.isReturnStatement(statement)) {
		return true;
	}

	return false;
}

function isThrowing(state: TransformState, statement: ts.Statement) {
	if (ts.isBlock(statement)) {
		return (
			statement.statements.length > 0 &&
			ts.isThrowStatement(statement.statements[statement.statements.length - 1])
		);
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

export function isInverseGuardClause(state: TransformState, node: ts.IfStatement) {
	if (
		node.elseStatement &&
		(isServerIfDirective(state, node) || isClientIfDirective(state, node)) &&
		(isReturning(state, node.elseStatement) || isThrowing(state, node.elseStatement))
	) {
		return true;
	}

	return false;
}

export function transformThenStatement(state: TransformState, node: ts.IfStatement) {
	if (ts.isBinaryExpression(node.expression)) {
		// E.g. $SERVER && $CLIENT (Host only)
		if (isServerDirective(state, node.expression.left) && isClientDirective(state, node.expression.right)) {
			return node.elseStatement ?? false;
		}

		// e.g. $SERVER && !$CLIENT (Dedicated server)
		if (isServerDirective(state, node.expression.left) && isServerDirective(state, node.expression.right)) {
			return state.isServerContext ? node.thenStatement : node.elseStatement ?? false;
		}

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

function isIdentifierLike(
	node: ts.Expression,
): node is
	| ts.Identifier
	| (ts.PrefixUnaryExpression & { operator: ts.SyntaxKind.ExclamationToken; operand: ts.Identifier }) {
	return (
		ts.isIdentifier(node) ||
		(ts.isPrefixUnaryExpression(node) &&
			node.operator === ts.SyntaxKind.ExclamationToken &&
			ts.isIdentifier(node.operand))
	);
}

export function isSimpleIfStatement(state: TransformState, node: ts.IfStatement) {
	return (
		isIdentifierLike(node.expression) ||
		(ts.isBinaryExpression(node.expression) &&
			node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
			isIdentifierLike(node.expression.left) &&
			isIdentifierLike(node.expression.right))
	);
}

export function transformDirectiveIfStatement(
	state: TransformState,
	node: ts.IfStatement,
	ignoreGuard = false,
	inverse = false,
): ts.Statement | false | undefined {
	if (!isSimpleIfStatement(state, node)) return;

	// if (ts.isBinaryExpression(node.expression)) {
	// 	const { left, right } = node.expression;

	// 	if (isServerDirective(state, left) && isServerDirective(state, right)) {
	// 		console.log("server check");
	// 		return;
	// 	}

	// 	return;
	// }

	if (isServerIfDirective(state, node)) {
		const useThenStatement = inverse ? !state.isServerContext : state.isServerContext;

		// we're in contextual mode
		if (useThenStatement) {
			return transformThenStatement(state, node);
		} else {
			return transformElseStatement(state, node); // node.elseStatement ?? false;
		}
	}

	if (isClientIfDirective(state, node)) {
		const useThenStatement = inverse ? !state.isClientContext : state.isClientContext;

		// we're in contextual mode
		if (useThenStatement) {
			return transformThenStatement(state, node);
		} else {
			return transformElseStatement(state, node); //node.elseStatement ?? false;
		}
	}

	if (isEditorIfDirective(state, node)) {
		const useThenStatement = inverse ? !state.isPublish : state.isPublish;

		if (useThenStatement) {
			return transformElseStatement(state, node); //node.elseStatement ?? false;
		} else {
			return transformThenStatement(state, node);
		}
	}

	return undefined;
}
