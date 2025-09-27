import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { CompilerDirective } from "TSTransformer/macros/directives";
import {
	isClientDirective,
	isNotClientDirective,
	isNotServerDirective,
	isServerDirective,
} from "TSTransformer/macros/directives/checkDirectives";
import ts, { factory } from "typescript";

export function isIdentifierOrExclamationIdentifier(
	expression: ts.Expression,
): expression is ts.Identifier | (ts.PrefixUnaryExpression & { operand: ts.Identifier }) {
	return (
		ts.isIdentifier(expression) || (ts.isPrefixUnaryExpression(expression) && ts.isIdentifier(expression.operand))
	);
}

export function isCallExpressionOrExclamationCallExpression(
	expression: ts.Expression,
): expression is ts.CallExpression | (ts.PrefixUnaryExpression & { operand: ts.CallExpression }) {
	return (
		ts.isCallExpression(expression) ||
		(ts.isPrefixUnaryExpression(expression) && ts.isCallExpression(expression.operand))
	);
}

function getDirective(
	state: TransformState,
	expression: ts.Expression,
	includeImplicitCalls: boolean,
): CompilerDirective | undefined {
	if (!isIdentifierOrExclamationIdentifier(expression) && !isCallExpressionOrExclamationCallExpression(expression)) {
		return;
	}

	if (isServerDirective(state, expression, includeImplicitCalls)) {
		return CompilerDirective.SERVER;
	}

	if (isClientDirective(state, expression, includeImplicitCalls)) {
		return CompilerDirective.CLIENT;
	}

	if (isNotClientDirective(state, expression, includeImplicitCalls)) {
		return CompilerDirective.NOT_CLIENT;
	}

	if (isNotServerDirective(state, expression, includeImplicitCalls)) {
		return CompilerDirective.NOT_SERVER;
	}
}

function isAndBinaryExpression(expression: ts.Expression): expression is ts.BinaryExpression {
	return ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
}

export interface DirectivesResult {
	/**
	 * The directives in this condition
	 */
	readonly directives: ReadonlyArray<CompilerDirective>;
	/**
	 * If the directive contains a complex check (e.g. includes non-directive expressions)
	 */
	readonly isComplexDirectiveCheck: boolean;
	/**
	 * If the directive contains a complex check, this should contain a new expression for the conditional
	 */
	readonly updatedExpression: ts.Expression | undefined;

	readonly isServer: boolean;
	readonly isClient: boolean;
}

/**
 * Parses directives in this expression, and will return an expression
 *
 * @returns Updated expression, or false if consumed, undefined if invalid
 */
export function parseDirectives(
	state: TransformState,
	conditionLikeExpression: ts.Expression,
	allowComplexExpressions = true,
	includeImplicitCalls = false,
): DirectivesResult | undefined {
	const directives = new Array<CompilerDirective>();

	if (
		isIdentifierOrExclamationIdentifier(conditionLikeExpression) ||
		(!state.isSharedContext &&
			includeImplicitCalls &&
			isCallExpressionOrExclamationCallExpression(conditionLikeExpression))
	) {
		// Simple directives here we can just translate directly
		const directive = getDirective(state, conditionLikeExpression, includeImplicitCalls);
		if (directive !== undefined) {
			directives.push(directive);
			return {
				directives,
				updatedExpression: undefined,
				isComplexDirectiveCheck: false,
				isServer: directive === CompilerDirective.SERVER || directive === CompilerDirective.NOT_CLIENT,
				isClient: directive === CompilerDirective.CLIENT || directive === CompilerDirective.NOT_SERVER,
			};
		}
	}

	if (allowComplexExpressions && isAndBinaryExpression(conditionLikeExpression)) {
		// eslint-disable-next-line no-autofix/prefer-const
		let { left, right } = conditionLikeExpression;
		const binaryExpressions = new Array<ts.Expression>();

		if (isAndBinaryExpression(left)) {
			do {
				if (
					isIdentifierOrExclamationIdentifier(left) ||
					(!state.isSharedContext &&
						includeImplicitCalls &&
						isCallExpressionOrExclamationCallExpression(left))
				) {
					const directive = getDirective(state, left, includeImplicitCalls);

					if (directive !== undefined) {
						directives.push(directive);
						continue;
					} else {
						binaryExpressions.push(right);
					}
				} else {
					binaryExpressions.push(right);
				}

				right = left.right;
				left = left.left;
			} while (isAndBinaryExpression(left));
		} else {
			if (
				isIdentifierOrExclamationIdentifier(left) ||
				(!state.isSharedContext && includeImplicitCalls && isCallExpressionOrExclamationCallExpression(left))
			) {
				const directive = getDirective(state, left, includeImplicitCalls);

				if (directive !== undefined) {
					directives.push(directive);
				} else {
					binaryExpressions.push(left);
				}
			} else {
				binaryExpressions.push(left);
			}
		}

		if (
			isIdentifierOrExclamationIdentifier(right) ||
			(!state.isSharedContext && includeImplicitCalls && isCallExpressionOrExclamationCallExpression(right))
		) {
			const directive = getDirective(state, right, includeImplicitCalls);

			if (directive !== undefined) {
				directives.push(directive);
			} else {
				binaryExpressions.push(right);
			}
		} else {
			binaryExpressions.push(right);
		}

		if (directives.length > 0) {
			let expr: ts.Expression | undefined;
			for (let i = 0; i < binaryExpressions.length; ) {
				const first = binaryExpressions[i];
				const second = binaryExpressions[i + 1];
				if (first && second) {
					expr = factory.createBinaryExpression(first, ts.SyntaxKind.AmpersandAmpersandToken, second);
					i += 2;
				} else if (first && expr) {
					assert(expr);
					expr = factory.createBinaryExpression(expr, ts.SyntaxKind.AmpersandAmpersandToken, first);
					i += 1;
				} else {
					expr = first;
					break;
				}
			}

			const result: DirectivesResult = {
				directives,
				updatedExpression: expr,
				isComplexDirectiveCheck: binaryExpressions.length > 0,
				isServer:
					directives.includes(CompilerDirective.SERVER) || directives.includes(CompilerDirective.NOT_CLIENT),
				isClient:
					directives.includes(CompilerDirective.CLIENT) || directives.includes(CompilerDirective.NOT_SERVER),
			};

			return result;
		}
	}

	return undefined;
}
