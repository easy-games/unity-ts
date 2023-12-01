import { assert } from "Shared/util/assert";
import ts from "typescript";

const TYPES_NOTICE = "\nYou may need to update your @easy-games/compiler-types!";

export const AIRSHIP_SYMBOL_NAMES = {
	AirshipBehaviour: "AirshipBehaviour",
} as const;

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
} as const;

/**
 * Manages the macros of the ts.
 */
export class AirshipSymbolManager {
	private symbols = new Map<string, ts.Symbol>();
	private symbolsToType = new Map<ts.Symbol, ts.Type>();
	private serializedTypes = new Set<ts.Type>();

	constructor(private typeChecker: ts.TypeChecker) {
		for (const symbolName of Object.values(AIRSHIP_SYMBOL_NAMES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);

			if (symbol) {
				this.symbols.set(symbolName, symbol);
			} else {
				// throw new ProjectError(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
				console.log(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
				continue;
			}
		}

		this.serializedTypes.add(typeChecker.getStringType());
		this.serializedTypes.add(typeChecker.getNumberType());
		this.serializedTypes.add(typeChecker.getBooleanType());

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
				// throw new ProjectError(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
				console.log(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
			}
		}
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
	}

	public getTypeFromSymbol(constructorSymbol: ts.Symbol) {
		return this.symbolsToType.get(constructorSymbol);
	}

	public isTypeSerializable(type: ts.Type) {
		if (this.typeChecker.isArrayType(type)) {
			type = this.typeChecker.getElementTypeOfArrayType(type)!;
		}

		return this.serializedTypes.has(type);
	}

	public hasSymbol(name: string) {
		return this.symbols.has(name);
	}

	public getAirshipBehaviourSymbolOrThrow() {
		return this.getSymbolOrThrow(AIRSHIP_SYMBOL_NAMES.AirshipBehaviour);
	}
}
