import { warnings } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { CompilerDirective } from "TSTransformer/macros/directives";
import {
	isClientDirective,
	isClientIfDirective,
	isServerDirective,
	isServerIfDirective,
} from "TSTransformer/macros/directives/checkDirectives";
import { parseDirectives } from "TSTransformer/macros/directives/transformGuardDirectives";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts, { CommentDirectiveType, factory } from "typescript";

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
	check: (state: TransformState, value: ts.Expression) => boolean,
) {
	if (ts.isBinaryExpression(node)) {
		return check(state, node.left) || check(state, node.right);
	}

	return false;
}

// if returns or throws early
export function isGuardClause(state: TransformState, node: ts.IfStatement) {
	if (
		(containsDirectiveLikeExpression(state, node.expression) ||
			containsDirectiveLikeExpression(state, node.expression) ||
			hasAnyExpression(state, node.expression, containsDirectiveLikeExpression)) &&
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

		// if (isServerDirective(state, node.expression.left)) {
		// 	return factory.updateIfStatement(node, node.expression.right, node.thenStatement, node.elseStatement);
		// } else if (isServerDirective(state, node.expression.right)) {
		// 	return factory.updateIfStatement(node, node.expression.left, node.thenStatement, node.elseStatement);
		// }
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

function transformDirectiveIfStatementInner(
	state: TransformState,
	ifStatement: ts.IfStatement,
	condition: boolean,
	conditionLikeExpression: ts.Expression | undefined,
) {
	if (condition) {
		if (conditionLikeExpression) {
			const result = transformThenStatement(state, ifStatement);
			if (!result) return false;

			return factory.createIfStatement(conditionLikeExpression, result);
		} else {
			return transformThenStatement(state, ifStatement);
		}
	} else {
		return transformElseStatement(state, ifStatement);
	}
}

export function transformDirectiveIfStatement(
	state: TransformState,
	ifStatement: ts.IfStatement,
): ts.Statement | false | undefined {
	const expression = ifStatement.expression;

	const parsedDirectiveCondition = parseDirectives(
		state,
		expression,
		/** allowComplexExpressions: */ true,
		/** implicitCalls: */ true,
	);
	if (parsedDirectiveCondition === undefined) return;
	const directives = parsedDirectiveCondition.directives;

	// console.log({
	// 	directives: parsedDirectiveCondition.directives,
	// 	text: expression.getText(),
	// 	isComplexDirectiveCheck: parsedDirectiveCondition.isComplexDirectiveCheck,
	// 	hasUpdatedExpr: parsedDirectiveCondition.updatedExpression !== undefined,
	// });

	if (
		(directives.includes(CompilerDirective.SERVER) && directives.includes(CompilerDirective.CLIENT)) ||
		(directives.includes(CompilerDirective.NOT_SERVER) && directives.includes(CompilerDirective.NOT_CLIENT))
	) {
		// Invalid use
		DiagnosticService.addDiagnostic(warnings.directiveIsAlwaysFalse(expression));
		if (!state.isSharedContext) return transformElseStatement(state, ifStatement);
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
			);
		} else if (directives.includes(CompilerDirective.CLIENT) && directives.includes(CompilerDirective.NOT_SERVER)) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isClientContext,
				parsedDirectiveCondition.updatedExpression,
			);
		} else if (isClientGuard) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isClientContext,
				parsedDirectiveCondition.updatedExpression,
			);
		} else if (isServerGuard) {
			return transformDirectiveIfStatementInner(
				state,
				ifStatement,
				state.isServerContext,
				parsedDirectiveCondition.updatedExpression,
			);
		}
	}
	//}
}
