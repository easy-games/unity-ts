import { TransformState } from "TSTransformer/classes/TransformState";
import { isNumericEnumValueType, isStringEnumValueType } from "TSTransformer/util/airshipBehaviourUtils";
import { parsePropertyExpression } from "TSTransformer/util/propertyValueParser";
import { isArrayType, isDefinitelyType } from "TSTransformer/util/types";
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

interface LiteralArrayValue {
	type: "array";
	value: Array<MetadataTypeValue>;
}

export type MetadataTypeValue = LiteralNumberValue | LiteralStringValue | LiteralBooleanValue | LiteralArrayValue;
export function getMetadataValueFromNode(
	state: TransformState,
	node: ts.Node,
	supportComplexValues: boolean,
): MetadataTypeValue | undefined {
	const type = state.typeChecker.getTypeAtLocation(node);

	if (supportComplexValues && isDefinitelyType(type, isArrayType(state)) && ts.isArrayLiteralExpression(node)) {
		const elements = node.elements.map(element => getMetadataValueFromNode(state, element, true));
		if (elements.every(element => element !== undefined)) {
			return {
				type: "array",
				value: elements,
			};
		}
	}

	if (isStringEnumValueType(type)) {
		return {
			type: "string",
			value: type.value,
		};
	} else if (isNumericEnumValueType(type)) {
		return {
			type: "number",
			value: type.value,
		};
	}

	if (ts.isExpression(node)) {
		const value = parsePropertyExpression(node);
		switch (typeof value) {
			case "string":
				return { type: "string", value };
			case "number":
				return { type: "number", value };
			case "boolean":
				return { type: "boolean", value };
		}
	}

	return undefined;
}
