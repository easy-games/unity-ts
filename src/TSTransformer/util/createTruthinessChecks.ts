import luau from "@roblox-ts/luau-ast";
import { warnings } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isUnityObjectType } from "TSTransformer/util/airshipBehaviourUtils";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { binaryExpressionChain } from "TSTransformer/util/expressionChain";
import { isEmptyStringType, isNaNType, isNumberLiteralType, isPossiblyType } from "TSTransformer/util/types";
import ts from "typescript";

export function willCreateTruthinessChecks(type: ts.Type) {
	return (
		isPossiblyType(type, isNumberLiteralType(0)) ||
		isPossiblyType(type, isNaNType) ||
		isPossiblyType(type, isEmptyStringType)
	);
}

export function createTruthinessChecks(state: TransformState, exp: luau.Expression, node: ts.Expression) {
	const type = state.getType(node);
	const isAssignableToZero = isPossiblyType(type, isNumberLiteralType(0));
	const isAssignableToNaN = isPossiblyType(type, isNaNType);
	const isAssignableToEmptyString = isPossiblyType(type, isEmptyStringType);
	const isUnityType = isUnityObjectType(state, type);

	if (isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString || isUnityType) {
		exp = state.pushToVarIfComplex(exp, "value");
	}

	const checks = new Array<luau.Expression>();

	if (isAssignableToZero) {
		checks.push(luau.binary(exp, "~=", luau.number(0)));
	}

	// workaround for https://github.com/microsoft/TypeScript/issues/32778
	if (isAssignableToZero || isAssignableToNaN) {
		checks.push(luau.binary(exp, "==", exp));
	}

	if (isAssignableToEmptyString) {
		checks.push(luau.binary(exp, "~=", luau.string("")));
	}

	if (isUnityType) {
		checks.push(luau.binary(exp, "~=", luau.nil()));
		checks.push(
			luau.unary(
				"not",
				luau.create(luau.SyntaxKind.MethodCallExpression, {
					expression: convertToIndexableExpression(exp),
					name: "IsDestroyed",
					args: luau.list.make(),
				}),
			),
		);
	} else {
		checks.push(exp);
	}

	if (state.data.logTruthyChanges && (isAssignableToZero || isAssignableToNaN || isAssignableToEmptyString)) {
		const checkStrs = new Array<string>();
		if (isAssignableToZero) checkStrs.push("0");
		if (isAssignableToZero || isAssignableToNaN) checkStrs.push("NaN");
		if (isAssignableToEmptyString) checkStrs.push('""');
		DiagnosticService.addDiagnostic(warnings.truthyChange(checkStrs.join(", "))(node));
	}

	return binaryExpressionChain(checks, "and");
}
