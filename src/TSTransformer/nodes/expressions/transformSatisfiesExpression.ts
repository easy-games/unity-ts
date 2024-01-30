import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformSatisfiesExpression(state: TransformState, node: ts.SatisfiesExpression) {
	return transformExpression(state, node.expression);
}
