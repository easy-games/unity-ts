import luau from "@roblox-ts/luau-ast";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { MacroManager } from "TSTransformer/classes/MacroManager";
import { SINGLETON_FILE_IMPORT } from "TSTransformer/classes/TransformState";
import { PROPERTY_SETTERS } from "TSTransformer/macros/propertyMacros";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { skipUpwards } from "TSTransformer/util/traversal";
import ts from "typescript";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const TYPES_NOTICE = "\nYou may need to update your @easy-games/compiler-types!";

export const AIRSHIP_SYMBOL_NAMES = {
	AirshipBehaviour: "AirshipBehaviour",
	AirshipSingleton: "AirshipSingleton",
	AirshipDecorator: "AirshipDecorator",
	AirshipBehaviourFieldDecorator: "AirshipBehaviourFieldDecorator",
	AirshipBehaviourClassDecorator: "AirshipBehaviourClassDecorator",
} as const;

export const UNITY_DATA_TYPES = ["Vector3", "Vector2", "Vector4", "Quaternion", "Matrix4x4", "Color", "Rect"];

const AIRSHIP_SERIALIZE_TYPES = {
	Vector3: "Vector3",
	Vector2: "Vector2",
	Vector4: "Vector4",
	Quaternion: "Quaternion",
	Matrix4x4: "Matrix4x4",
	Color: "Color",
	Rect: "Rect",
	LayerMask: "LayerMask",
	// GameObject: "GameObject",
	Object: "Object",
	Transform: "Transform",
	AnimationCurve: "AnimationCurve",
} as const;

export const AIRSHIP_SINGLETON_MACROS = {
	Get: (state, node) => {
		const importId = state.addFileImport(SINGLETON_FILE_IMPORT, "SingletonRegistry");
		const Singletons_Resolve = luau.property(importId, "Resolve");

		const functionType = state.typeChecker.getTypeAtLocation(node);
		if (functionType !== undefined) {
			return luau.call(Singletons_Resolve, [luau.string(state.typeChecker.typeToString(functionType))]);
		}

		return luau.nil();
	},
} satisfies MacroList<PropertyCallMacro>;

/**
 * Manages the macros of the ts.
 */
export class AirshipSymbolManager {
	private symbols = new Map<string, ts.Symbol>();
	private symbolsToType = new Map<ts.Symbol, ts.Type>();
	private dataTypes = new Set<ts.Type>();
	private serializedTypes = new Set<ts.Type>();

	constructor(private typeChecker: ts.TypeChecker, private macroManager: MacroManager) {
		for (const symbolName of Object.values(AIRSHIP_SYMBOL_NAMES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);

			if (symbol) {
				this.symbols.set(symbolName, symbol);
			} else {
				throw new ProjectError(`AirshipSymbolManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
			}
		}

		this.serializedTypes.add(typeChecker.getStringType());
		this.serializedTypes.add(typeChecker.getNumberType());
		this.serializedTypes.add(typeChecker.getBooleanType());

		const singletonSymbol = this.getAirshipSingletonSymbolOrThrow();
		const singletonMethodMap = new Map<string, ts.Symbol>();
		for (const declaration of singletonSymbol.declarations ?? []) {
			if (ts.isClassDeclaration(declaration)) {
				for (const member of declaration.members) {
					if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
						const symbol = getType(typeChecker, member).symbol;
						assert(symbol);
						singletonMethodMap.set(member.name.text, symbol);
					}
				}
			}
		}

		const behaviourSymbol = this.getAirshipBehaviourSymbolOrThrow();
		const behaviourPropertyMap = new Map<string, ts.Symbol>();
		for (const declaration of behaviourSymbol.declarations ?? []) {
			if (ts.isClassDeclaration(declaration)) {
				for (const member of declaration.members) {
					if (ts.isAccessor(member) && ts.isIdentifier(member.name)) {
						const symbol = typeChecker.getSymbolAtLocation(member.name);
						assert(symbol, "No symbol for accessor");
						behaviourPropertyMap.set(member.name.text, symbol);
					}
				}
			}
		}

		// for (const [propertyName, macro] of Object.entries(AIRSHIP_PROPERTY_GET)) {
		// }

		for (const [propertyName, macro] of Object.entries(PROPERTY_SETTERS.AirshipBehaviour)) {
			const methodSymbol = behaviourPropertyMap.get(propertyName);
			if (!methodSymbol) {
				throw new ProjectError(
					`The types for method AirshipBehaviour.${propertyName} could not be found` + TYPES_NOTICE,
				);
			}

			macroManager.addPropertySetMacro(methodSymbol, macro);
		}

		for (const [methodName, macro] of Object.entries(AIRSHIP_SINGLETON_MACROS)) {
			const methodSymbol = singletonMethodMap.get(methodName);
			if (!methodSymbol) {
				throw new ProjectError(
					`The types for method AirshipSingleton.${methodName} could not be found` + TYPES_NOTICE,
				);
			}
			macroManager.addPropertyCallMacro(methodSymbol, macro);
		}

		for (const symbolName of Object.values(UNITY_DATA_TYPES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);

			if (symbol) {
				// Since some of our symbols have multiple 'declarations' - fetch the interface declaration
				const interfaceDeclaration = symbol.declarations?.find(
					f => f.kind === ts.SyntaxKind.InterfaceDeclaration,
				);

				if (interfaceDeclaration) {
					const interfaceType = typeChecker.getTypeAtLocation(interfaceDeclaration);
					this.dataTypes.add(interfaceType);
				}
			}
		}

		for (const symbolName of Object.values(AIRSHIP_SERIALIZE_TYPES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);

			if (symbol) {
				this.symbols.set(symbolName, symbol);

				// Since some of our symbols have multiple 'declarations' - fetch the interface declaration
				const interfaceDeclaration = symbol.declarations?.find(
					f => f.kind === ts.SyntaxKind.InterfaceDeclaration,
				);

				if (interfaceDeclaration) {
					const interfaceType = typeChecker.getTypeAtLocation(interfaceDeclaration);
					this.serializedTypes.add(interfaceType);

					this.symbolsToType.set(symbol, interfaceType);
				}
			} else {
				throw new ProjectError(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
			}
		}
	}

	public getNamedSymbolOrThrow(name: keyof typeof AIRSHIP_SYMBOL_NAMES) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol, `Invalid symbol name '${name}'`);
		return symbol;
	}

	public findSymbol(name: string) {
		const symbol = this.symbols.get(name);
		return symbol;
	}

	public getTypeFromSymbol(constructorSymbol: ts.Symbol) {
		return this.symbolsToType.get(constructorSymbol);
	}

	public isDataType(type: ts.Type) {
		return this.dataTypes.has(type);
	}

	public isTypeSerializable(type: ts.Type): boolean {
		if (this.typeChecker.isArrayType(type)) {
			type = this.typeChecker.getElementTypeOfArrayType(type)!;
		}

		return this.serializedTypes.has(type.getNonNullableType());
	}

	public hasSymbol(name: string) {
		return this.symbols.has(name);
	}

	public getAirshipBehaviourSymbolOrThrow() {
		return this.getSymbolOrThrow(AIRSHIP_SYMBOL_NAMES.AirshipBehaviour);
	}

	public getAirshipSingletonSymbolOrThrow() {
		return this.getSymbolOrThrow(AIRSHIP_SYMBOL_NAMES.AirshipSingleton);
	}
}
