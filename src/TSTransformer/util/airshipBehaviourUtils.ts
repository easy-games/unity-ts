import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import {
	AirshipBehaviourCallValue,
	AirshipBehaviourMethodCallValue,
	AirshipBehaviourStaticMemberValue,
} from "Shared/types";
import { TransformState } from "TSTransformer";
import { assert } from "console";
import ts from "typescript";

export function isPublicWritablePropertyDeclaration(node: ts.PropertyDeclaration) {
	// If no modifiers, then it's public by default anyway
	if (!node.modifiers) return true;
	const isPrivateOrProtected = node.modifiers.some(
		f =>
			f.kind === ts.SyntaxKind.PrivateKeyword ||
			f.kind === ts.SyntaxKind.ProtectedKeyword ||
			f.kind === ts.SyntaxKind.ReadonlyKeyword ||
			f.kind === ts.SyntaxKind.StaticKeyword,
	);

	return !isPrivateOrProtected;
}

export function getAllTypes(type: ts.Type) {
	if (type.isIntersection()) {
		return type.types;
	} else {
		return [type];
	}
}

export function getAncestorTypeSymbols(state: TransformState, nodeType: ts.Type) {
	// ensure non-nullable (e.g. if `GameObject | undefined` - make `GameObject`)
	if (nodeType.isNullableType()) {
		nodeType = nodeType.getNonNullableType();
	}

	const baseTypes = nodeType.getBaseTypes();
	if (baseTypes) {
		const symbols = new Array<ts.Symbol>();
		for (const baseType of baseTypes) {
			symbols.push(baseType.symbol);

			for (const parentSymbol of getAncestorTypeSymbols(state, baseType)) {
				symbols.push(parentSymbol);
			}
		}
		return symbols;
	} else {
		return [];
	}
}

export function isAirshipDecorator(state: TransformState, decorator: ts.Decorator) {
	const expression = decorator.expression;
	if (!ts.isCallExpression(expression)) return false;

	const aliasSymbol = state.typeChecker.getTypeAtLocation(expression).aliasSymbol;
	if (!aliasSymbol) return false;

	const airshipFieldSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("AirshipDecorator");
	return airshipFieldSymbol === aliasSymbol;
}

export function isUnityObjectType(state: TransformState, nodeType: ts.Type) {
	const objectSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("Object");

	const objectInheritanceTree = getAncestorTypeSymbols(state, nodeType);
	return objectInheritanceTree.includes(objectSymbol);
}

export function createIsDestroyedLuauMethodCall(expression: luau.IndexableExpression): luau.MethodCallExpression {
	return luau.create(luau.SyntaxKind.MethodCallExpression, {
		name: "IsDestroyed",
		expression: expression,
		args: luau.list.make(),
	});
}

export function isEnumType(type: ts.Type) {
	return (type.flags & ts.TypeFlags.EnumLike) !== 0;
}

export function getEnumValue(state: TransformState, value: ts.PropertyAccessExpression) {
	const valueType = state.getType(value);

	if (valueType.isStringLiteral()) {
		return valueType.value;
	} else if (valueType.isNumberLiteral()) {
		return valueType.value;
	}
}

export function getEnumKey(value: ts.PropertyAccessExpression) {
	return value.name.text;
}

export function getEnumRecord(enumType: ts.Type): Record<string, string | number> {
	const valueDeclaration = enumType.getSymbol()?.valueDeclaration;

	if (valueDeclaration && ts.isEnumDeclaration(valueDeclaration)) {
		const map: Record<string, string | number> = {};

		let idx = 0;
		for (const member of valueDeclaration.members) {
			if (!ts.isIdentifier(member.name)) {
				continue;
			}

			if (member.initializer) {
				if (ts.isStringLiteral(member.initializer)) {
					map[member.name.text] = member.initializer.text;
				} else if (isNumericLike(member.initializer)) {
					idx = parseNumericNode(member.initializer) ?? 0;
					map[member.name.text] = idx;
					idx++;
				}
			} else {
				map[member.name.text] = idx++;
			}
		}

		return map;
	}

	return {};
}

export function isValidAirshipBehaviourExportType(state: TransformState, node: ts.Node) {
	const nodeType = state.getType(node);

	if (state.typeChecker.isArrayType(nodeType)) {
		const innerArrayType = state.typeChecker.getElementTypeOfArrayType(nodeType)!;
		return (
			state.services.airshipSymbolManager.isTypeSerializable(innerArrayType) ||
			isUnityObjectType(state, innerArrayType)
		);
	} else if (isEnumType(nodeType)) {
		return true;
	} else {
		return state.services.airshipSymbolManager.isTypeSerializable(nodeType) || isUnityObjectType(state, nodeType);
	}
}

function isNumericLike(
	node: ts.Expression,
): node is (ts.PrefixUnaryExpression & { operand: ts.NumericLiteral }) | ts.NumericLiteral {
	if (
		ts.isPrefixUnaryExpression(node) &&
		ts.isNumericLiteral(node.operand) &&
		node.operator === ts.SyntaxKind.MinusToken
	) {
		return true;
	}

	return ts.isNumericLiteral(node);
}

function parseNumericNode(node: ts.PrefixUnaryExpression | ts.NumericLiteral) {
	if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
		if (node.operator === ts.SyntaxKind.MinusToken) {
			return -parseFloat(node.operand.text);
		}
	} else if (ts.isNumericLiteral(node)) {
		return parseFloat(node.text);
	}

	assert(false);
}

export function getUnityObjectInitializerDefaultValue(
	state: TransformState,
	initializer: ts.Expression,
):
	| AirshipBehaviourCallValue
	| AirshipBehaviourStaticMemberValue
	| AirshipBehaviourMethodCallValue
	| string
	| number
	| boolean
	| undefined {
	if (ts.isNewExpression(initializer)) {
		const constructableType = state.typeChecker.getSymbolAtLocation(initializer.expression);
		if (!constructableType) return undefined;

		const constructing = state.services.airshipSymbolManager.getTypeFromSymbol(constructableType);
		if (!constructing) return undefined;

		const allLiterals = initializer.arguments?.every(
			(argument): argument is ts.StringLiteral | ts.NumericLiteral =>
				ts.isStringOrNumericLiteralLike(argument) || isNumericLike(argument),
		);
		if (!allLiterals) return undefined;

		return {
			target: "constructor",
			type: state.typeChecker.typeToString(constructing),
			arguments: initializer.arguments.map(v => {
				if (isNumericLike(v)) {
					return parseNumericNode(v);
				} else if (ts.isStringLiteral(v)) {
					return v.text;
				}
			}),
		};
	} else if (ts.isCallExpression(initializer)) {
		let constructorType: ts.Type | undefined;
		let methodName: string;

		if (ts.isPropertyAccessExpression(initializer.expression) && ts.isIdentifier(initializer.expression.name)) {
			const lhsSymbol = state.typeChecker.getSymbolAtLocation(initializer.expression.expression);
			constructorType = lhsSymbol ? state.services.airshipSymbolManager.getTypeFromSymbol(lhsSymbol) : undefined;
			methodName = initializer.expression.name.text;
		} else {
			return undefined;
		}

		if (!constructorType) return undefined;

		const allLiterals = initializer.arguments?.every(
			(argument): argument is ts.StringLiteral | ts.NumericLiteral =>
				ts.isStringOrNumericLiteralLike(argument) || isNumericLike(argument),
		);
		if (!allLiterals) return undefined;

		return {
			target: "method",
			method: methodName,
			type: state.typeChecker.typeToString(constructorType),
			arguments: initializer.arguments.map(v => {
				if (isNumericLike(v)) {
					return parseNumericNode(v);
				} else if (ts.isStringLiteral(v)) {
					return v.text;
				}
			}),
		};
	} else if (ts.isPropertyAccessExpression(initializer)) {
		const constructableType = state.typeChecker.getSymbolAtLocation(initializer.expression);
		if (!constructableType) return undefined;

		const constructing = state.services.airshipSymbolManager.getTypeFromSymbol(constructableType);
		if (!constructing) return undefined;

		return {
			target: "property",
			type: state.typeChecker.typeToString(constructing),
			member: initializer.name.text,
		};
	} else if (ts.isStringLiteral(initializer)) {
		return initializer.text;
	} else if (isNumericLike(initializer)) {
		return parseNumericNode(initializer);
	} else if (ts.isBooleanLiteral(initializer)) {
		return initializer.kind === ts.SyntaxKind.TrueKeyword;
	} else {
		return undefined;
	}
}
