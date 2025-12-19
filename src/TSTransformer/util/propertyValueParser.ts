import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

type BinaryExpressionOf<T, U = T> = ts.BinaryExpression & { left: T; right: U };
function isMatchingBinaryOperands<T extends ts.Expression, U extends Array<unknown>>(
	expression: ts.BinaryExpression,
	check: (value: ts.Expression, ...values: U) => value is T,
	...pass: U
): expression is BinaryExpressionOf<T> {
	const { left, right } = expression;
	return check(left, ...pass) && check(right, ...pass);
}

function isBinaryOperands<A extends ts.Expression, B extends ts.Expression>(
	expression: ts.BinaryExpression,
	checkleft: (value: ts.Expression) => value is A,
	checkright: (value: ts.Expression) => value is B,
): expression is BinaryExpressionOf<A, B> {
	const { left, right } = expression;
	return checkleft(left) && checkright(right);
}

export function parseNumericExpression(
	state: TransformState,
	literal: NumericLikeNode | ts.BinaryExpression,
): number | undefined {
	if (ts.isNumericLiteral(literal)) {
		return parseFloat(literal.text);
	} else if (isNumericLikeNode(literal) && literal.operator === ts.SyntaxKind.MinusToken) {
		return -parseFloat(literal.operand.text);
	} else if (
		ts.isBinaryExpression(literal) &&
		(isMatchingBinaryOperands(literal, ts.isNumericLiteral) ||
			isBinaryOperands(literal, ts.isBinaryExpression, ts.isNumericLiteral))
	) {
		return parseNumericLikeBinaryExpressions(state, literal.left, literal.operatorToken, literal.right);
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

export function evaluateNumericOperation(left: number, operator: ts.BinaryOperatorToken, right: number) {
	switch (operator.kind) {
		case ts.SyntaxKind.SlashToken: {
			return left / right;
		}
		case ts.SyntaxKind.PlusToken: {
			return left + right;
		}
		case ts.SyntaxKind.MinusToken: {
			return left - right;
		}
		case ts.SyntaxKind.AsteriskToken: {
			return left * right;
		}
		case ts.SyntaxKind.AsteriskAsteriskToken: {
			return left ** right;
		}
		case ts.SyntaxKind.GreaterThanGreaterThanToken: {
			return left >> right;
		}
		case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: {
			return left >>> right;
		}
		case ts.SyntaxKind.LessThanLessThanToken: {
			return left << right;
		}
		case ts.SyntaxKind.BarToken: {
			return left | right;
		}
		case ts.SyntaxKind.AmpersandToken: {
			return left & right;
		}
		case ts.SyntaxKind.CaretToken: {
			return left ^ right;
		}
	}
}

export function parseNumericLikeBinaryExpressions(
	state: TransformState,
	left: NumericLikeNode | ts.BinaryExpression,
	operand: ts.BinaryOperatorToken,
	right: NumericLikeNode | ts.BinaryExpression,
) {
	const leftOperand = parseNumericExpression(state, left);
	const rightOperand = parseNumericExpression(state, right);

	if (leftOperand === undefined || rightOperand === undefined) return;
	return evaluateNumericOperation(leftOperand, operand, rightOperand);
}

export function parsePropertyExpression(
	state: TransformState,
	expression: ts.Expression,
): string | number | boolean | undefined {
	if (ts.isBinaryExpression(expression)) {
		if (isMatchingBinaryOperands(expression, isNumericLikeNode)) {
			return parseNumericLikeBinaryExpressions(
				state,
				expression.left,
				expression.operatorToken,
				expression.right,
			);
		} else if (ts.isBinaryExpression(expression.left) && isNumericLikeNode(expression.right)) {
			return parseNumericLikeBinaryExpressions(
				state,
				expression.left,
				expression.operatorToken,
				expression.right,
			);
		} else if (ts.isBinaryExpression(expression.left) && ts.isBinaryExpression(expression.right)) {
			return parseNumericLikeBinaryExpressions(
				state,
				expression.left,
				expression.operatorToken,
				expression.right,
			);
		}
	} else if (isNumericLikeNode(expression)) {
		return parseNumericExpression(state, expression);
	} else if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
		return parseStringLikeExpression(expression);
	} else if (ts.isBooleanLiteral(expression)) {
		return expression.kind === ts.SyntaxKind.TrueKeyword;
	}
}

export function isParseablePropertyExpression(state: TransformState, expression: ts.Expression) {
	return parsePropertyExpression(state, expression) !== undefined;
}
