import luau from "@roblox-ts/luau-ast";
import { assert } from "console";
import {
	AirshipBehaviourCallValue,
	AirshipBehaviourMethodCallValue,
	AirshipBehaviourStaticMemberValue,
	EnumType,
} from "Shared/types";
import { TransformState } from "TSTransformer";
import { isAirshipBehaviourType } from "TSTransformer/util/extendsAirshipBehaviour";
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

export function getExtendsClasses(typeChecker: ts.TypeChecker, node: ts.ClassLikeDeclaration) {
	const superClasses = new Array<ts.ClassDeclaration>();
	const superClass = node.heritageClauses?.find(x => x.token === ts.SyntaxKind.ExtendsKeyword)?.types?.[0];
	if (superClass) {
		const aliasSymbol = typeChecker.getSymbolAtLocation(superClass.expression);
		if (aliasSymbol) {
			const symbol = ts.skipAlias(aliasSymbol, typeChecker);

			const classDeclaration = symbol?.declarations?.find((x): x is ts.ClassLikeDeclaration =>
				ts.isClassDeclaration(x),
			);
			if (classDeclaration) {
				superClasses.push(classDeclaration as never);
				superClasses.push(...getExtendsClasses(typeChecker, classDeclaration));
			}
		}
	}
	return superClasses;
}

export function getSymbolsOfClasses(typeChecker: ts.TypeChecker, nodes: ReadonlyArray<ts.ClassDeclaration>) {
	const symbols = new Array<ts.Type>();

	for (const node of nodes) {
		const symbol = typeChecker.getTypeAtLocation(node);
		if (!symbol) continue;
		symbols.push(symbol);
	}

	return symbols;
}

export function getAncestorTypeSymbols(nodeType: ts.Type, typeChecker: ts.TypeChecker) {
	// ensure non-nullable (e.g. if `GameObject | undefined` - make `GameObject`)
	if (nodeType.isNullableType()) {
		nodeType = nodeType.getNonNullableType();
	}

	const baseTypes = nodeType.getBaseTypes();

	if (baseTypes) {
		const symbols = new Array<ts.Symbol>();
		for (const baseType of baseTypes) {
			symbols.push(baseType.symbol);

			for (const parentSymbol of getAncestorTypeSymbols(baseType, typeChecker)) {
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

	const objectInheritanceTree = getAncestorTypeSymbols(nodeType, state.typeChecker);
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

type EnumRecord = Record<string, string | number>;
export interface EnumMetadata {
	index: number;
	enumType: EnumType;
	record: EnumRecord;
}

function appendEnumMember(member: ts.EnumMember, state: EnumMetadata, isFlags: boolean) {
	if (!ts.isIdentifier(member.name)) {
		return;
	}

	if (member.initializer) {
		if (ts.isStringLiteral(member.initializer)) {
			state.record[member.name.text] = member.initializer.text;
			state.enumType = EnumType.StringEnum;
		} else if (isNumericLike(member.initializer)) {
			state.index = parseNumericNode(member.initializer) ?? 0;
			state.record[member.name.text] = state.index;
			state.index++;
		} else if (
			ts.isBinaryExpression(member.initializer) &&
			member.initializer.operatorToken.kind === ts.SyntaxKind.LessThanLessThanToken &&
			ts.isNumericLiteral(member.initializer.left) &&
			ts.isNumericLiteral(member.initializer.right)
		) {
			state.enumType = EnumType.FlagEnum;
			const value = parseInt(member.initializer.left.text) << parseInt(member.initializer.right.text);

			state.record[member.name.text] = value;
			state.index = value + 1;
		}
	} else {
		if (state.enumType !== EnumType.FlagEnum) state.record[member.name.text] = state.index++;
	}
}

export function getEnumMetadata(enumType: ts.Type, isFlagEnum = false): Readonly<EnumMetadata> | undefined {
	const valueDeclaration = enumType.getSymbol()?.valueDeclaration;

	if (!valueDeclaration) return undefined;

	const state: EnumMetadata = {
		index: 0,
		enumType: isFlagEnum ? EnumType.FlagEnum : EnumType.IntEnum,
		record: {},
	};

	if (ts.isEnumDeclaration(valueDeclaration)) {
		for (const member of valueDeclaration.members) {
			appendEnumMember(member, state, isFlagEnum);
		}

		return state;
	} else if (ts.isEnumMember(valueDeclaration)) {
		appendEnumMember(valueDeclaration, state, isFlagEnum);
		return state;
	}

	return undefined;
}

export function isValidAirshipBehaviourExportType(state: TransformState, node: ts.Node) {
	const nodeType = state.getType(node);

	if (state.typeChecker.isArrayType(nodeType)) {
		const innerArrayType = state.typeChecker.getElementTypeOfArrayType(nodeType)!;
		return (
			state.services.airshipSymbolManager.isTypeSerializable(innerArrayType) ||
			isUnityObjectType(state, innerArrayType) ||
			isEnumType(innerArrayType) ||
			isAirshipBehaviourType(state, innerArrayType)
		);
	} else if (isEnumType(nodeType)) {
		return true;
	} else {
		return (
			state.services.airshipSymbolManager.isTypeSerializable(nodeType) ||
			isUnityObjectType(state, nodeType) ||
			isAirshipBehaviourType(state, nodeType)
		);
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
