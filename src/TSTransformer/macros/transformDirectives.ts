import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
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

		return $SERVER === symbol;
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

		return $CLIENT === symbol;
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

function transformThenStatement(state: TransformState, node: ts.IfStatement) {
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

function transformElseStatement(state: TransformState, node: ts.IfStatement) {
	return node.elseStatement ?? false;
}

export function containsDirectiveLikeExpression(state: TransformState, expression: ts.Expression) {
	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
		expression = expression.operand; // skip !
	}

	if (ts.isIdentifier(expression) || ts.isCallExpression(expression)) {
		return isServerDirective(state, expression) || isClientDirective(state, expression);
	}

	return false;
}

function transformServerIfDirective(state: TransformState, node: ts.IfStatement) {
	if (state.isServerContext) {
		return transformThenStatement(state, node);
	} else {
		return transformElseStatement(state, node);
	}
}

function transformClientIfDirective(state: TransformState, node: ts.IfStatement) {
	if (state.isClientContext) {
		return transformThenStatement(state, node);
	} else {
		return transformElseStatement(state, node);
	}
}

function transformComplexDirectiveIfStatement(
	state: TransformState,
	ifStatement: ts.IfStatement,
	binaryExpression: ts.BinaryExpression,
): ts.Statement | false | undefined {
	const { left, right } = binaryExpression;

	// We consider a binary expression (e.g. X && Y as complex)
	// But we're only gonna allow 1-depth expressions, anything deeper is invalid

	/**
	 * e.g. if ($SERVER && Game.IsHosting())
	 * if ($SERVER && !$CLIENT)
	 */
	if (containsDirectiveLikeExpression(state, left)) {
		if (isServerDirective(state, left) && !ts.isBinaryExpression(right)) {
			return transformServerIfDirective(state, ifStatement);
		}
		if (isClientDirective(state, left) && !ts.isBinaryExpression(right)) {
			return transformClientIfDirective(state, ifStatement);
		}
	}

	/**
	 * e.g. if (Game.IsHosting() && $SERVER)
	 * if (!$CLIENT && $SERVER)
	 */
	if (containsDirectiveLikeExpression(state, binaryExpression.right)) {
		if (isServerDirective(state, right) && !ts.isBinaryExpression(left)) {
			return transformServerIfDirective(state, ifStatement);
		}
		if (isClientDirective(state, right) && !ts.isBinaryExpression(left)) {
			return transformClientIfDirective(state, ifStatement);
		}
	}

	return;
}

export function transformDirectiveConditionalExpression(state: TransformState, conditional: ts.ConditionalExpression) {
	const condition = conditional.condition;

	if (isServerDirective(state, condition)) {
		if (state.isServerContext) {
			return transformExpression(state, conditional.whenTrue);
		} else {
			return transformExpression(state, conditional.whenFalse);
		}
	}

	if (isClientDirective(state, condition)) {
		if (state.isClientContext) {
			return transformExpression(state, conditional.whenTrue);
		} else {
			return transformExpression(state, conditional.whenFalse);
		}
	}

	assert(false);
}

export function transformDirectiveIfStatement(
	state: TransformState,
	ifStatement: ts.IfStatement,
): ts.Statement | false | undefined {
	const expression = ifStatement.expression;

	if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return transformComplexDirectiveIfStatement(state, ifStatement, expression);
	} else if (containsDirectiveLikeExpression(state, expression)) {
		// Simple directive macro usage
		if (isServerDirective(state, expression)) {
			return transformServerIfDirective(state, ifStatement);
		} else if (isClientDirective(state, expression)) {
			return transformClientIfDirective(state, ifStatement);
		}
	}
}
