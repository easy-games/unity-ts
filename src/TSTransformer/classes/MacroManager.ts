import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { CONSTRUCTOR_MACROS } from "TSTransformer/macros/constructorMacros";
import { IDENTIFIER_MACROS } from "TSTransformer/macros/identifierMacros";
import { GAME_MACROS, PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import {
	CallDecoratorMacro,
	CallMacro,
	ConstructorMacro,
	IdentifierMacro,
	PropertyCallMacro,
	PropertyGetMacro,
	PropertySetMacro,
} from "TSTransformer/macros/types";
import { skipUpwards } from "TSTransformer/util/traversal";
import ts, { MethodDeclaration } from "typescript";

function getType(typeChecker: ts.TypeChecker, node: ts.Node) {
	return typeChecker.getTypeAtLocation(skipUpwards(node));
}

const TYPES_NOTICE = "\nYou may need to update the @Easy/Core package (through the Airship -> Packages menu)";

export const SYMBOL_NAMES = {
	globalThis: "globalThis",

	ArrayConstructor: "ArrayConstructor",
	SetConstructor: "SetConstructor",
	MapConstructor: "MapConstructor",
	WeakSetConstructor: "WeakSetConstructor",
	WeakMapConstructor: "WeakMapConstructor",
	ReadonlyMapConstructor: "ReadonlyMapConstructor",
	ReadonlySetConstructor: "ReadonlySetConstructor",

	Array: "Array",
	Generator: "Generator",
	IterableFunction: "IterableFunction",
	LuaTuple: "LuaTuple",
	Map: "Map",
	CSDictionary: "CSDictionary",
	// CSKeyCollection: "CSKeyCollection",
	Object: "Object",
	ReadonlyArray: "ReadonlyArray",
	ReadonlyMap: "ReadonlyMap",
	ReadonlySet: "ReadonlySet",
	ReadVoxelsArray: "ReadVoxelsArray",
	Set: "Set",
	String: "String",
	TemplateStringsArray: "TemplateStringsArray",
	WeakMap: "WeakMap",
	WeakSet: "WeakSet",

	Iterable: "Iterable",

	$range: "$range",
	$tuple: "$tuple",

	$SERVER: "$SERVER",
	$CLIENT: "$CLIENT",
	Server: "Server",
	Client: "Client",
} as const;

export const NOMINAL_LUA_TUPLE_NAME = "_nominal_LuaTuple";

const MACRO_ONLY_CLASSES = new Set<string>([
	SYMBOL_NAMES.ReadonlyArray,
	SYMBOL_NAMES.Array,
	SYMBOL_NAMES.ReadonlyMap,
	SYMBOL_NAMES.WeakMap,
	SYMBOL_NAMES.Map,
	SYMBOL_NAMES.ReadonlySet,
	SYMBOL_NAMES.WeakSet,
	SYMBOL_NAMES.Set,
	SYMBOL_NAMES.String,
]);

function getFirstDeclarationOrThrow<T extends ts.Node>(symbol: ts.Symbol, check: (value: ts.Node) => value is T): T {
	for (const declaration of symbol.declarations ?? []) {
		if (check(declaration)) {
			return declaration;
		}
	}
	throw new ProjectError("");
}

function getGlobalSymbolByNameOrThrow(typeChecker: ts.TypeChecker, name: string, meaning: ts.SymbolFlags) {
	const symbol = typeChecker.resolveName(name, undefined, meaning, false);
	if (symbol) {
		return symbol;
	}

	throw new ProjectError(`The types for symbol '${name}' could not be found` + TYPES_NOTICE);
}

function getConstructorSymbol(node: ts.InterfaceDeclaration) {
	for (const member of node.members) {
		if (ts.isConstructSignatureDeclaration(member)) {
			assert(member.symbol);
			return member.symbol;
		}
	}
	throw new ProjectError(`The types for constructor '${node.name.text}' could not be found` + TYPES_NOTICE);
}

export function isNamedDeclaration(node?: ts.Node): node is ts.NamedDeclaration & { name: ts.DeclarationName } {
	return node !== undefined && ts.isNamedDeclaration(node);
}

interface PropertyMacro {
	get: PropertyGetMacro | undefined;
	set: PropertySetMacro | undefined;
}

/**
 * Manages the macros of the ts.
 */
export class MacroManager {
	private symbols = new Map<string, ts.Symbol>();
	private identifierMacros = new Map<ts.Symbol, IdentifierMacro>();
	private callMacros = new Map<ts.Symbol, CallMacro>();
	private constructorMacros = new Map<ts.Symbol, ConstructorMacro>();
	private propertyCallMacros = new Map<ts.Symbol, PropertyCallMacro>();
	private decoratorMacros = new Map<ts.Symbol, CallDecoratorMacro>();
	private macroOnlySymbols = new Set<ts.Symbol>();
	private propertyMacros = new Map<ts.Symbol, PropertyMacro>();

	public readonly isServerSymbol: ts.Symbol | undefined;
	public readonly isClientSymbol: ts.Symbol | undefined;
	public readonly isEditorSymbol: ts.Symbol | undefined;

	constructor(private readonly typeChecker: ts.TypeChecker, private readonly program: ts.Program) {
		for (const [name, macro] of Object.entries(IDENTIFIER_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, name, ts.SymbolFlags.Variable);
			this.identifierMacros.set(symbol, macro);
		}

		for (const [name, macro] of Object.entries(CALL_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, name, ts.SymbolFlags.Function);
			this.callMacros.set(symbol, macro);
		}

		for (const [className, macro] of Object.entries(CONSTRUCTOR_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, className, ts.SymbolFlags.Interface);
			const interfaceDec = getFirstDeclarationOrThrow(symbol, ts.isInterfaceDeclaration);
			const constructSymbol = getConstructorSymbol(interfaceDec);
			this.constructorMacros.set(constructSymbol, macro);
		}

		for (const [className, methods] of Object.entries(PROPERTY_CALL_MACROS)) {
			const symbol = getGlobalSymbolByNameOrThrow(typeChecker, className, ts.SymbolFlags.Interface);

			const methodMap = new Map<string, ts.Symbol>();
			for (const declaration of symbol.declarations ?? []) {
				if (ts.isInterfaceDeclaration(declaration)) {
					for (const member of declaration.members) {
						if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
							const symbol = getType(typeChecker, member).symbol;
							assert(symbol);
							methodMap.set(member.name.text, symbol);
						}
					}
				}
			}

			for (const [methodName, macro] of Object.entries(methods)) {
				const methodSymbol = methodMap.get(methodName);
				if (!methodSymbol) {
					throw new ProjectError(
						`The types for method ${className}.${methodName} could not be found` + TYPES_NOTICE,
					);
				}
				this.propertyCallMacros.set(methodSymbol, macro);
			}
		}

		for (const symbolName of Object.values(SYMBOL_NAMES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);
			if (symbol) {
				this.symbols.set(symbolName, symbol);
			} else {
				throw new ProjectError(`The types for symbol '${symbolName}' could not be found` + TYPES_NOTICE);
			}
		}

		/** Macros relating to Game */
		const gameModuleDir = path.relative(process.cwd(), "AirshipPackages/@Easy/Core/Shared/Game.ts");
		const gameModuleFile = program.getSourceFile(gameModuleDir);
		if (gameModuleFile) {
			const gameDeclaration = gameModuleFile.statements.find(
				(f): f is ts.ClassDeclaration => ts.isClassDeclaration(f) && f.name?.text === "Game",
			);

			if (gameDeclaration) {
				const isServer = gameDeclaration.members.find(
					(f): f is MethodDeclaration & { name: ts.Identifier } =>
						ts.isMethodDeclaration(f) && ts.isIdentifier(f.name) && f.name.text === "IsServer",
				);
				if (isServer) this.isServerSymbol = typeChecker.getSymbolAtLocation(isServer.name);

				const isClient = gameDeclaration.members.find(
					(f): f is MethodDeclaration & { name: ts.Identifier } =>
						ts.isMethodDeclaration(f) && ts.isIdentifier(f.name) && f.name.text === "IsClient",
				);
				if (isClient) this.isClientSymbol = typeChecker.getSymbolAtLocation(isClient.name);

				const isEditor = gameDeclaration.members.find(
					(f): f is MethodDeclaration & { name: ts.Identifier } =>
						ts.isMethodDeclaration(f) && ts.isIdentifier(f.name) && f.name.text === "IsEditor",
				);
				if (isEditor) this.isEditorSymbol = typeChecker.getSymbolAtLocation(isEditor.name);
			}
		}

		const luaTupleTypeDec = this.symbols
			.get(SYMBOL_NAMES.LuaTuple)
			?.declarations?.find(v => ts.isTypeAliasDeclaration(v));
		if (luaTupleTypeDec) {
			const nominalLuaTupleSymbol = typeChecker
				.getTypeAtLocation(luaTupleTypeDec)
				.getProperty(NOMINAL_LUA_TUPLE_NAME);
			if (nominalLuaTupleSymbol) {
				this.symbols.set(NOMINAL_LUA_TUPLE_NAME, nominalLuaTupleSymbol);
			}
		}
	}

	public isMacroOnlySymbol(symbol: ts.Symbol) {
		return this.macroOnlySymbols.has(symbol);
	}

	public addCallMacro(symbol: ts.Symbol, macro: CallMacro, ignoreImport = true) {
		this.callMacros.set(symbol, macro);
		if (ignoreImport) {
			this.macroOnlySymbols.add(symbol);
		}
	}

	public addPropertyCallMacro(symbol: ts.Symbol, macro: PropertyCallMacro, ignoreImport = false) {
		this.propertyCallMacros.set(symbol, macro);
		if (ignoreImport) {
			this.macroOnlySymbols.add(symbol);
		}
	}

	public addPropertyGetMacro(symbol: ts.Symbol, macro: PropertyGetMacro) {
		let macros = this.propertyMacros.get(symbol);
		if (!macros) {
			macros = {
				get: macro,
				set: undefined,
			};
			this.propertyMacros.set(symbol, macros);
		} else {
			macros.get = macro;
		}
	}

	public addPropertySetMacro(symbol: ts.Symbol, macro: PropertySetMacro) {
		let macros = this.propertyMacros.get(symbol);
		if (!macros) {
			macros = {
				set: macro,
				get: undefined,
			};
			this.propertyMacros.set(symbol, macros);
		} else {
			macros.set = macro;
		}
	}

	public addDecoratorMacro(symbol: ts.Symbol, macro: CallDecoratorMacro, ignoreImport = false) {
		this.decoratorMacros.set(symbol, macro);
		if (ignoreImport) {
			this.macroOnlySymbols.add(symbol);
		}
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
	}

	public isMacroOnlyClass(symbol: ts.Symbol) {
		return this.symbols.get(symbol.name) === symbol && MACRO_ONLY_CLASSES.has(symbol.name);
	}

	public getPropertyMacro(symbol: ts.Symbol) {
		return this.propertyMacros.get(symbol);
	}

	public getDecoratorMacro(symbol: ts.Symbol) {
		return this.decoratorMacros.get(symbol);
	}

	public getIdentifierMacro(symbol: ts.Symbol) {
		return this.identifierMacros.get(symbol);
	}

	public getCallMacro(symbol: ts.Symbol) {
		return this.callMacros.get(symbol);
	}

	public getConstructorMacro(symbol: ts.Symbol) {
		return this.constructorMacros.get(symbol);
	}

	public getSymbolFromNode(node: ts.Node, followAlias = true): ts.Symbol | undefined {
		if (isNamedDeclaration(node)) {
			return this.getSymbolFromNode(node.name);
		}

		const symbol = this.typeChecker.getSymbolAtLocation(node);

		if (symbol && followAlias) {
			return ts.skipAlias(symbol, this.typeChecker);
		} else {
			return symbol;
		}
	}

	public findPropertyCallMacro(symbol: ts.Symbol) {
		const macro = this.propertyCallMacros.get(symbol);
		return macro;
	}

	public getPropertyCallMacro(symbol: ts.Symbol) {
		const macro = this.propertyCallMacros.get(symbol);
		if (
			!macro &&
			symbol.parent &&
			this.symbols.get(symbol.parent.name) === symbol.parent &&
			this.isMacroOnlyClass(symbol.parent)
		) {
			assert(false, `Macro ${symbol.parent.name}.${symbol.name}() is not implemented!`);
		}
		return macro;
	}

	public isPropertyCallMacro(symbol: ts.Symbol) {
		const macro = this.propertyCallMacros.get(symbol);
		return macro !== undefined;
	}

	public isDirective(symbol: ts.Symbol) {
		return symbol === this.getSymbolOrThrow("$CLIENT") || symbol === this.getSymbolOrThrow("$SERVER");
	}

	public isDirectiveAtLocation(node: ts.Expression) {
		const symbol = this.typeChecker.getSymbolAtLocation(node);
		if (!symbol) return false;
		return this.isDirective(symbol);
	}
}
