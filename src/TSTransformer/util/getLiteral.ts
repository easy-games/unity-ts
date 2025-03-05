import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

interface LiteralNumberValue {
	type: "number";
	value: number;
}

interface LiteralStringValue {
	type: "string";
	value: string;
}

interface LiteralBooleanValue {
	type: "boolean";
	value: boolean;
}

export type LiteralValue = LiteralNumberValue | LiteralStringValue | LiteralBooleanValue;
export function getLiteralFromNode(state: TransformState, node: ts.Node): LiteralValue | undefined {
	if (ts.isNumericLiteral(node)) {
		return { type: "number", value: parseFloat(node.text) };
	} else if (ts.isStringLiteral(node)) {
		return { type: "string", value: node.text };
	} else if (ts.isBooleanLiteral(node)) {
		return { type: "boolean", value: node.kind === ts.SyntaxKind.TrueKeyword };
	} else if (ts.isPrefixUnaryExpression(node)) {
		if (ts.isNumericLiteral(node.operand) && node.operator === ts.SyntaxKind.MinusToken) {
			return { type: "number", value: -parseFloat(node.operand.text) };
		}
	} else if (ts.isNoSubstitutionTemplateLiteral(node)) {
		return { type: "string", value: node.text };
	}

	return undefined;
}
