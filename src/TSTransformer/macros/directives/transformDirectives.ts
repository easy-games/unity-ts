import { warnings } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { CompilerDirective } from "TSTransformer/macros/directives";
import { isClientDirective, isServerDirective } from "TSTransformer/macros/directives/checkDirectives";
import { DirectivesResult, parseDirectives } from "TSTransformer/macros/directives/transformGuardDirectives";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts, { factory } from "typescript";

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

function hasAnyExpression(
	state: TransformState,
	node: ts.Expression,
	check: (state: TransformState, value: ts.Expression, includeImplicitCalls: boolean) => boolean,
	includeImplicitCalls: boolean,
) {
	if (ts.isBinaryExpression(node)) {
		return check(state, node.left, includeImplicitCalls) || check(state, node.right, includeImplicitCalls);
	}

	return false;
}

// if returns or throws early
export function isGuardClause(state: TransformState, node: ts.IfStatement, includeImplicitCalls: boolean) {
	if (
		(containsDirectiveLikeExpression(state, node.expression, includeImplicitCalls) ||
			containsDirectiveLikeExpression(state, node.expression, includeImplicitCalls) ||
			hasAnyExpression(state, node.expression, containsDirectiveLikeExpression, includeImplicitCalls)) &&
		(isReturning(state, node.thenStatement) || isThrowing(state, node.thenStatement))
	) {
		return true;
	}

	return false;
}

// export function isInverseGuardClause(state: TransformState, node: ts.IfStatement) {
// 	if (
// 		node.elseStatement &&
// 		(isServerIfDirective(state, node) || isClientIfDirective(state, node)) &&
// 		(isReturning(state, node.elseStatement) || isThrowing(state, node.elseStatement))
// 	) {
// 		return true;
// 	}

// 	return false;
// }

function transformThenStatement(state: TransformState, node: ts.IfStatement, includeImplicitCalls: boolean) {
	if (ts.isBinaryExpression(node.expression)) {
		// E.g. $SERVER && $CLIENT (Host only)
		if (
			isServerDirective(state, node.expression.left, includeImplicitCalls) &&
			isClientDirective(state, node.expression.right, includeImplicitCalls)
		) {
			return node.elseStatement ?? false;
		}

		// e.g. $SERVER && !$CLIENT (Dedicated server)
		if (
			isServerDirective(state, node.expression.left, includeImplicitCalls) &&
			isServerDirective(state, node.expression.right, includeImplicitCalls)
		) {
			return state.isServerContext ? node.thenStatement : node.elseStatement ?? false;
		}
	}

	return node.thenStatement;
}

function transformElseStatement(state: TransformState, node: ts.IfStatement) {
	return node.elseStatement ?? false;
}

export function containsDirectiveLikeExpression(
	state: TransformState,
	expression: ts.Expression,
	includeImplicitCalls: boolean,
) {
	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
		expression = expression.operand; // skip !
	}

	if (ts.isIdentifier(expression) || ts.isCallExpression(expression)) {
		return (
			isServerDirective(state, expression, includeImplicitCalls) ||
			isClientDirective(state, expression, includeImplicitCalls)
		);
	}

	return false;
}

export function transformDirectiveConditionalExpression(
	state: TransformState,
	conditional: ts.ConditionalExpression,
	includeImplicitCalls: boolean,
) {
	const condition = conditional.condition;

	if (isServerDirective(state, condition, includeImplicitCalls)) {
		if (state.isServerContext) {
			return transformExpression(state, conditional.whenTrue);
		} else {
			return transformExpression(state, conditional.whenFalse);
		}
	}

	if (isClientDirective(state, condition, includeImplicitCalls)) {
		if (state.isClientContext) {
			return transformExpression(state, conditional.whenTrue);
		} else {
			return transformExpression(state, conditional.whenFalse);
		}
	}

	assert(false);
}

export enum DirectiveStatementKind {
	Skip,
	Then,
	Else,
}
export function checkDirectiveIfStatement(
	state: TransformState,
	ifStatement: ts.IfStatement,
	condition: boolean,
	directives: DirectivesResult,
	includeImplicitCalls: boolean,
): DirectiveStatementKind {
	if (condition) {
		if (directives.updatedExpression) {
			const result = transformThenStatement(state, ifStatement, includeImplicitCalls);
			if (!result) return DirectiveStatementKind.Skip;
			return DirectiveStatementKind.Then;
		} else {
			return DirectiveStatementKind.Then;
		}
	} else {
		return DirectiveStatementKind.Else;
	}
}

export const enum DirectiveIfBranch {
	None,
	IfTrue,
	IfFalse,
}
export interface DirectiveIfTransformResult {
	newStatement: ts.Statement | undefined;
	branch: DirectiveIfBranch;
	skipped?: boolean;
}

export function transformDirectiveIfStatementInner(
	state: TransformState,
	ifStatement: ts.IfStatement,
	condition: boolean,
	conditionLikeExpression: ts.Expression | undefined,
	includeImplicitCalls: boolean,
): DirectiveIfTransformResult {
	if (condition) {
		if (conditionLikeExpression) {
			const result = transformThenStatement(state, ifStatement, includeImplicitCalls);
			if (!result) return { newStatement: undefined, skipped: true, branch: DirectiveIfBranch.None };

			return {
				newStatement: factory.createIfStatement(conditionLikeExpression, result),
				branch: DirectiveIfBranch.IfTrue,
			};
		} else {
			const result = transformThenStatement(state, ifStatement, includeImplicitCalls);
			if (!result) return { newStatement: undefined, skipped: true, branch: DirectiveIfBranch.None };
			return { newStatement: result, branch: DirectiveIfBranch.IfTrue };
		}
	} else {
		const result = transformElseStatement(state, ifStatement);
		if (!result) return { newStatement: undefined, skipped: true, branch: DirectiveIfBranch.None };
		return { newStatement: result, branch: DirectiveIfBranch.IfFalse };
	}
}

export function transformDirectiveIfStatement(
	state: TransformState,
	ifStatement: ts.IfStatement,
): DirectiveIfTransformResult | undefined {
	const expression = ifStatement.expression;

	const implicitCalls = state.data.stripImplicitContextCalls;
	const parsedDirectiveCondition = parseDirectives(
		state,
		expression,
		/** allowComplexExpressions: */ true,
		/** implicitCalls: */ implicitCalls,
	);
	if (parsedDirectiveCondition === undefined) return;
	const directives = parsedDirectiveCondition.directives;

	if (
		(directives.includes(CompilerDirective.SERVER) && directives.includes(CompilerDirective.CLIENT)) ||
		(directives.includes(CompilerDirective.NOT_SERVER) && directives.includes(CompilerDirective.NOT_CLIENT))
	) {
		// Invalid use
		DiagnosticService.addDiagnostic(warnings.directiveIsAlwaysFalse(expression));
		if (!state.isSharedContext) {
			const result = transformElseStatement(state, ifStatement);
			if (!result) return { newStatement: undefined, skipped: true, branch: DirectiveIfBranch.None };
			return { newStatement: result, branch: DirectiveIfBranch.IfFalse };
		}
	}

	if (!state.isSharedContext) {
		const isServerGuard =
			directives.includes(CompilerDirective.SERVER) || directives.includes(CompilerDirective.NOT_CLIENT);

		const isClientGuard =
			directives.includes(CompilerDirective.CLIENT) || directives.includes(CompilerDirective.NOT_SERVER);

		if (directives.includes(CompilerDirective.SERVER) && directives.includes(CompilerDirective.NOT_CLIENT)) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isServerContext,
				parsedDirectiveCondition.updatedExpression,
				implicitCalls,
			);
		} else if (directives.includes(CompilerDirective.CLIENT) && directives.includes(CompilerDirective.NOT_SERVER)) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isClientContext,
				parsedDirectiveCondition.updatedExpression,
				implicitCalls,
			);
		} else if (isClientGuard) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isClientContext,
				parsedDirectiveCondition.updatedExpression,
				implicitCalls,
			);
		} else if (isServerGuard) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isServerContext,
				parsedDirectiveCondition.updatedExpression,
				implicitCalls,
			);
		}
	}
	//}
}
