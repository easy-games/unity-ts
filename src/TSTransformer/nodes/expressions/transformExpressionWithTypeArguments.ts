import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions//transformExpression";
import ts from "typescript";

export function transformExpressionWithTypeArguments(state: TransformState, node: ts.ExpressionWithTypeArguments) {
	return transformExpression(state, node.expression);
}
