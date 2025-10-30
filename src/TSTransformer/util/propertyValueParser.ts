import exp from "constants";
import ts, { isPrefixUnaryExpression } from "typescript";

type BinaryExpressionOf<T, U = T> = ts.BinaryExpression & { left: T; right: U };
function isMatchingBinaryOperands<T extends ts.Expression>(
	expression: ts.BinaryExpression,
	check: (value: ts.Expression) => value is T,
): expression is BinaryExpressionOf<T> {
	const { left, right } = expression;
	return check(left) && check(right);
}

function isBinaryOperands<A extends ts.Expression, B extends ts.Expression>(
	expression: ts.BinaryExpression,
	checkleft: (value: ts.Expression) => value is A,
	checkright: (value: ts.Expression) => value is B,
): expression is BinaryExpressionOf<A, B> {
	const { left, right } = expression;
	return checkleft(left) && checkright(right);
}

export function parseNumericExpression(literal: NumericLikeNode | ts.BinaryExpression): number | undefined {
	if (ts.isNumericLiteral(literal)) {
		return parseFloat(literal.text);
	} else if (isNumericLikeNode(literal) && literal.operator === ts.SyntaxKind.MinusToken) {
		return -parseFloat(literal.operand.text);
	} else if (
		ts.isBinaryExpression(literal) &&
		(isMatchingBinaryOperands(literal, ts.isNumericLiteral) ||
			isBinaryOperands(literal, ts.isBinaryExpression, ts.isNumericLiteral))
	) {
		return parseNumericLikeBinaryExpressions(literal.left, literal.operatorToken, literal.right);
	}
}

type NumericLikeNode = (ts.PrefixUnaryExpression & { operand: ts.NumericLiteral }) | ts.NumericLiteral;
export function isNumericLikeNode(node: ts.Expression): node is NumericLikeNode {
	if (
		ts.isPrefixUnaryExpression(node) &&
		ts.isNumericLiteral(node.operand) &&
		node.operator === ts.SyntaxKind.MinusToken
	) {
		return true;
	}

	return ts.isNumericLiteral(node);
}

export type StringLikeExpression = ts.StringLiteralLike;
export function parseStringLikeExpression(expression: StringLikeExpression): string | undefined {
	if (ts.isStringLiteral(expression)) {
		return expression.text;
	} else if (ts.isNoSubstitutionTemplateLiteral(expression)) {
		return expression.text;
	}
}

export function parseNumericLikeBinaryExpressions(
	left: NumericLikeNode | ts.BinaryExpression,
	operand: ts.BinaryOperatorToken,
	right: NumericLikeNode | ts.BinaryExpression,
) {
	const leftOperand = parseNumericExpression(left);
	const rightOperand = parseNumericExpression(right);

	if (leftOperand === undefined || rightOperand === undefined) return;

	switch (operand.kind) {
		case ts.SyntaxKind.SlashToken: {
			return leftOperand / rightOperand;
		}
		case ts.SyntaxKind.PlusToken: {
			return leftOperand + rightOperand;
		}
		case ts.SyntaxKind.MinusToken: {
			return leftOperand - rightOperand;
		}
		case ts.SyntaxKind.AsteriskToken: {
			return leftOperand * rightOperand;
		}
		case ts.SyntaxKind.AsteriskAsteriskToken: {
			return leftOperand ** rightOperand;
		}
		case ts.SyntaxKind.GreaterThanGreaterThanToken: {
			return leftOperand >> rightOperand;
		}
		case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: {
			return leftOperand >>> rightOperand;
		}
		case ts.SyntaxKind.LessThanLessThanToken: {
			return leftOperand << rightOperand;
		}
		case ts.SyntaxKind.BarToken: {
			return leftOperand | rightOperand;
		}
		case ts.SyntaxKind.AmpersandToken: {
			return leftOperand & rightOperand;
		}
		case ts.SyntaxKind.CaretToken: {
			return leftOperand ^ rightOperand;
		}
	}
}

export function parsePropertyExpression(expression: ts.Expression): string | number | boolean | undefined {
	if (ts.isBinaryExpression(expression)) {
		if (isMatchingBinaryOperands(expression, isNumericLikeNode)) {
			return parseNumericLikeBinaryExpressions(expression.left, expression.operatorToken, expression.right);
		} else if (ts.isBinaryExpression(expression.left) && isNumericLikeNode(expression.right)) {
			return parseNumericLikeBinaryExpressions(expression.left, expression.operatorToken, expression.right);
		} else if (ts.isBinaryExpression(expression.left) && ts.isBinaryExpression(expression.right)) {
			return parseNumericLikeBinaryExpressions(expression.left, expression.operatorToken, expression.right);
		}
	} else if (isNumericLikeNode(expression)) {
		return parseNumericExpression(expression);
	} else if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
		return parseStringLikeExpression(expression);
	}
}

export function isParseablePropertyExpression(expression: ts.Expression) {
	return parsePropertyExpression(expression) !== undefined;
}
