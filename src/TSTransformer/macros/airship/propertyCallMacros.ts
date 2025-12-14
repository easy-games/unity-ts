import luau from "@roblox-ts/luau-ast";
import { errors, warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { getGlobalSymbolByNameOrThrow } from "TSTransformer/classes/MacroManager";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { getTypeMacroArgumentString, isUnityObjectType } from "TSTransformer/util/airshipBehaviourUtils";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import {
	isAirshipBehaviourType,
	isAirshipBehaviourTypeNode,
	isAirshipScriptableObjectType,
} from "TSTransformer/util/extendsAirshipBehaviour";
import ts from "typescript";

function isGenericReferenceNode(state: TransformState, typeNode: ts.TypeNode) {
	if (ts.isTypeReferenceNode(typeNode)) {
		const symbol = state.typeChecker.getSymbolAtLocation(typeNode.typeName);
		if (!symbol) return false;
		return state.services.macroManager.genericParameterToId.has(symbol.id);
	}

	return false;
}

function getGenericId(state: TransformState, typeNode: ts.TypeNode) {
	if (ts.isTypeReferenceNode(typeNode)) {
		const symbol = state.typeChecker.getSymbolAtLocation(typeNode.typeName);
		if (!symbol) return undefined;
		return state.services.macroManager.genericParameterToId.get(symbol.id);
	}

	return undefined;
}

const expectAirshipComponentGeneric = (
	name: string,
	propertyCallMacro: PropertyCallMacro,
	index: 0 = 0,
): PropertyCallMacro => {
	return (state, node, expression, args) => {
		if (node.typeArguments) {
			const typeNode = node.typeArguments[index];
			if (!isAirshipBehaviourTypeNode(state, typeNode) && !isGenericReferenceNode(state, typeNode)) {
				DiagnosticService.addDiagnostic(
					errors.unityMacroExpectsAirshipComponentTypeArgument(
						node,
						state.typeChecker.typeToString(state.typeChecker.getTypeFromTypeNode(node.typeArguments[0])),
						getAirshipMacroAlternativeName(propertyCallMacro)!,
						isUnityObjectType(state, state.getType(typeNode)),
					),
				);
			}
		}

		return propertyCallMacro(state, node, expression, args);
	};
};

const expectUnityComponentGeneric = (
	name: string,
	propertyCallMacro: PropertyCallMacro,
	index: 0 = 0,
): PropertyCallMacro => {
	return (state, node, expression, args) => {
		if (node.typeArguments) {
			const type = state.getType(node.typeArguments[index]);
			if (!isUnityObjectType(state, type)) {
				DiagnosticService.addDiagnostic(
					errors.unityMacroExpectsComponentTypeArgument(
						node,
						state.typeChecker.typeToString(state.typeChecker.getTypeFromTypeNode(node.typeArguments[0])),
						getAirshipMacroAlternativeName(propertyCallMacro)!,
						isAirshipBehaviourType(state, type, true),
					),
				);
			}
		}

		return propertyCallMacro(state, node, expression, args);
	};
};

const makeTypeArgumentAsStringMacro =
	(method: string, requiresArgument = true, defaultTypeName?: string): PropertyCallMacro =>
	(state, node, expression, args) => {
		let type: ts.Type | undefined;

		const id = node.typeArguments ? getGenericId(state, node.typeArguments[0]) : undefined;

		if (node.typeArguments) {
			type = state.getType(node.typeArguments[0]);
		} else if (ts.isAsExpression(node.parent)) {
			type = state.getType(node.parent.type);
			DiagnosticService.addDiagnostic(
				warnings.unityMacroAsExpressionWarning(method, state.typeChecker.typeToString(type))(node.parent),
			);
		}

		if (requiresArgument && !defaultTypeName && !type && args.length === 0) {
			DiagnosticService.addSingleDiagnostic(errors.unityMacroTypeArgumentRequired(node, method));
		}

		if (type) {
			const typeName = getTypeMacroArgumentString(state, type);

			args.unshift(id ?? luau.string(typeName));
			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: convertToIndexableExpression(expression),
				name: method,
				args: luau.list.make(...args),
			});
		} else {
			if (defaultTypeName !== undefined) {
				args.unshift(luau.string(defaultTypeName));
			}

			return luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: convertToIndexableExpression(expression),
				name: method,
				args: luau.list.make(...args),
			});
		}
	};

const COMPONENT_MACROS = {
	GetComponent: makeTypeArgumentAsStringMacro("GetComponent"),
	GetComponents: makeTypeArgumentAsStringMacro("GetComponents"),
	AddComponent: makeTypeArgumentAsStringMacro("AddComponent"),
	GetComponentInChildren: makeTypeArgumentAsStringMacro("GetComponentInChildren"),
	GetComponentsInChildren: makeTypeArgumentAsStringMacro("GetComponentsInChildren"),
	GetComponentInParent: makeTypeArgumentAsStringMacro("GetComponentInParent"),
	GetComponentsInParent: makeTypeArgumentAsStringMacro("GetComponentsInParent"),
} satisfies MacroList<PropertyCallMacro>;

const AIRSHIP_COMPONENT_MACROS = {
	GetAirshipComponent: makeTypeArgumentAsStringMacro("GetAirshipComponent"),
	GetAirshipComponents: makeTypeArgumentAsStringMacro("GetAirshipComponents"),
	AddAirshipComponent: makeTypeArgumentAsStringMacro("AddAirshipComponent"),
	GetAirshipComponentsInChildren: makeTypeArgumentAsStringMacro("GetAirshipComponentsInChildren"),
	GetAirshipComponentInChildren: makeTypeArgumentAsStringMacro("GetAirshipComponentInChildren"),
	GetAirshipComponentInParent: makeTypeArgumentAsStringMacro("GetAirshipComponentInParent"),
	GetAirshipComponentsInParent: makeTypeArgumentAsStringMacro("GetAirshipComponentsInParent"),
} satisfies MacroList<PropertyCallMacro>;

const ALTERNATIVE_NAMES: ReadonlyArray<
	[airship: PropertyCallMacro, unityName: keyof typeof COMPONENT_MACROS | keyof typeof AIRSHIP_COMPONENT_MACROS]
> = [
	[COMPONENT_MACROS.AddComponent, "AddAirshipComponent"],
	[COMPONENT_MACROS.GetComponent, "GetAirshipComponent"],
	[COMPONENT_MACROS.GetComponentInChildren, "GetAirshipComponentInChildren"],
	[COMPONENT_MACROS.GetComponentInParent, "GetAirshipComponentInParent"],
	[COMPONENT_MACROS.GetComponents, "GetAirshipComponents"],
	[COMPONENT_MACROS.GetComponentsInChildren, "GetAirshipComponentsInChildren"],
	[COMPONENT_MACROS.GetComponentsInParent, "GetAirshipComponentsInParent"],

	[AIRSHIP_COMPONENT_MACROS.AddAirshipComponent, "AddComponent"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponent, "GetComponent"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponentInChildren, "GetComponentInChildren"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponentInParent, "GetComponentInParent"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponents, "GetComponents"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponentsInChildren, "GetComponentsInChildren"],
	[AIRSHIP_COMPONENT_MACROS.GetAirshipComponentsInParent, "GetComponentsInParent"],
];

export const UNITY_GAMEOBJECT_METHODS: MacroList<PropertyCallMacro> = {};
for (const [macro, call] of Object.entries(AIRSHIP_COMPONENT_MACROS)) {
	UNITY_GAMEOBJECT_METHODS[macro] = expectAirshipComponentGeneric(macro, call);
}
for (const [macro, call] of Object.entries(COMPONENT_MACROS)) {
	UNITY_GAMEOBJECT_METHODS[macro] = expectUnityComponentGeneric(macro, call);
}

export const UNITY_STATIC_GAMEOBJECT_METHODS: MacroList<PropertyCallMacro> = {
	FindObjectOfType: makeTypeArgumentAsStringMacro("FindObjectOfType"),
	FindObjectsByType: makeTypeArgumentAsStringMacro("FindObjectsByType"),
};
export const UNITY_COMPONENT_METHODS: MacroList<PropertyCallMacro> = {
	GetComponent: COMPONENT_MACROS.GetComponent,
	GetComponents: COMPONENT_MACROS.GetComponents,
};
export const UNITY_OBJECT_METHODS: MacroList<PropertyCallMacro> = {
	IsA: makeTypeArgumentAsStringMacro("IsA"),
};

const createAssetLoadMacro: (name: string) => PropertyCallMacro = name => (state, node, expression, args) => {
	const signature = state.typeChecker.getTypeAtLocation(node).getNonNullableType();
	const symbol = signature.getSymbol();

	const [typeArgument] = node.typeArguments ?? [];
	const [path] = args;

	// Handle sprite loading differently c:
	if (symbol === getGlobalSymbolByNameOrThrow(state.typeChecker, "Sprite", ts.SymbolFlags.Interface)) {
		if (luau.isStringLiteral(path) && !path.value.endsWith(".sprite")) {
			path.value += ".sprite";
		}
	}

	if (isUnityObjectType(state, signature)) {
		const tempId = luau.tempId("unityAsset");

		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: tempId,
				right: luau.create(luau.SyntaxKind.MethodCallExpression, {
					name: name,
					expression: convertToIndexableExpression(expression),
					args: luau.list.make(...args),
				}),
			}),
		);

		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.assert, [
					luau.create(luau.SyntaxKind.MethodCallExpression, {
						expression: tempId,
						name: "IsA",
						args: luau.list.make(luau.string(state.typeChecker.typeToString(signature))),
					}),
					luau.string("LoadAsset expected a " + state.typeChecker.typeToString(signature)),
				]),
			}),
		);

		return tempId;
	} else if (isAirshipScriptableObjectType(state, signature)) {
		const tempId = luau.tempId("scriptableAsset");

		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: tempId,
				right: luau.create(luau.SyntaxKind.MethodCallExpression, {
					name: name,
					expression: convertToIndexableExpression(expression),
					args: luau.list.make(...args),
				}),
			}),
		);

		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.assert, [
					luau.binary(luau.call(luau.globals.typeof, [tempId]), "==", luau.string("table")),
					luau.string("LoadAsset expected a " + state.typeChecker.typeToString(signature)),
				]),
			}),
		);

		return tempId;
	} else {
		return luau.create(luau.SyntaxKind.MethodCallExpression, {
			name: name,
			expression: convertToIndexableExpression(expression),
			args: luau.list.make(...args),
		});
	}
};

export const Asset = {
	LoadAsset: createAssetLoadMacro("LoadAsset"),
	LoadAssetIfExists: createAssetLoadMacro("LoadAssetIfExists"),
} satisfies MacroList<PropertyCallMacro>;

function getAirshipMacroAlternativeName(propertyMacro: PropertyCallMacro): string | undefined {
	return ALTERNATIVE_NAMES.find(f => f[0] === propertyMacro)?.[1];
}
