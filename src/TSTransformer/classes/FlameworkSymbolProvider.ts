import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import fs from "fs";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { ProjectData } from "Shared/types";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import {
	FLAMEWORK_CALL_MACROS,
	FLAMEWORK_MODDING_PROPERTY_CALL_MACROS,
	FLAMEWORK_PROPERTY_CALL_MACROS,
} from "TSTransformer/macros/flamework/callMacros";
import { TransformServices } from "TSTransformer/types";
import ts, { isIdentifier } from "typescript";

const moduleResolutionCache = new Map<string, string | false>();
const EXCLUDED_NAME_DIR = new Set(["src/", "lib/", "out/"]);

export class FlameworkSymbolProvider {
	public fileSymbols = new Map<string, FlameworkModuleFile>();

	public moddingFile!: FlameworkModuleFile;
	public flameworkFile!: FlameworkModuleFile;
	public flamework!: FlameworkNamespace;

	public usesFlamework = false;
	public usesModding = false;
	public usesReflect = false;

	public flameworkRootDir = "AirshipPackages/@Easy/Core/Shared/Flamework";
	private flameworkDir = this.resolveModuleDir(this.flameworkRootDir);

	public readonly flameworkId = luau.tempId("Flamework");
	public readonly moddingId = luau.tempId("Modding");
	public readonly reflectionId = luau.tempId("Reflect");

	public decorators = new Set<ts.Symbol>();

	constructor(
		private readonly program: ts.Program,
		private readonly compilerOptions: ts.CompilerOptions,
		private readonly data: ProjectData,
		private readonly services: TransformServices,
	) {}

	public Flamework(name: string) {
		this.usesFlamework = true;
		return luau.property(this.flameworkId, name);
	}

	public Reflect(name: string) {
		this.usesReflect = true;
		return luau.property(this.reflectionId, name);
	}

	getSourceFile(node: ts.Node) {
		const parseNode = ts.getParseTreeNode(node);
		if (!parseNode) throw new Error(`Could not find parse tree node`);

		return ts.getSourceFileOfNode(parseNode);
	}

	private resolveModuleDir(moduleName: string) {
		const modulePath = moduleResolutionCache.get(moduleName);
		if (modulePath !== undefined) return modulePath || undefined;

		const dummyFile = path.join(this.compilerOptions.rootDir ?? this.data.projectPath, "dummy.ts");
		const module = ts.resolveModuleName(moduleName, dummyFile, this.compilerOptions, ts.sys);
		const resolvedModule = module.resolvedModule;
		if (resolvedModule) {
			const modulePath = fs.realpathSync(path.join(resolvedModule.resolvedFileName, "../"));
			moduleResolutionCache.set(moduleName, modulePath);
			return modulePath;
		}
		moduleResolutionCache.set(moduleName, false);
	}

	private registeredFiles = 0;
	private registerFileSymbol(file: ts.SourceFile) {
		const name = this.getName("typescript", path.dirname(this.data.tsConfigPath), file);

		if (this.fileSymbols.has(name)) {
			LogService.warn("duplicate file symbol. name=" + name + ", fileName=" + file.fileName);
			return this.fileSymbols.get(name)!;
		}

		const fileSymbol = new FlameworkModuleFile(this.program.getTypeChecker(), file, name);
		this.fileSymbols.set(name, fileSymbol);
		this.registeredFiles++;
		return fileSymbol;
	}

	findFile(name: string) {
		return this.fileSymbols.get(name);
	}

	getFile(name: string) {
		const fileSymbol = this.findFile(name);
		assert(fileSymbol, `Could not find fileSymbol for '${name}'`);

		return fileSymbol;
	}

	private getName(packageName: string, directory: string, file: ts.SourceFile) {
		const relativePath = path
			.relative(directory, file.fileName)
			.replace(/\\/g, "/")
			.replace(/(\.d)?.ts$/, "");

		if (EXCLUDED_NAME_DIR.has(relativePath.substr(0, 4))) {
			return `${packageName}/${relativePath.substr(4)}`;
		}

		return `${relativePath}`;
	}

	private isFileInteresting(file: ts.SourceFile) {
		if (this.flameworkDir && isPathDescendantOf(file.fileName, this.flameworkDir)) {
			return true;
		}

		return false;
	}

	private finalize() {
		LogService.writeLineIfVerbose("Flamework located at: " + this.flameworkDir);

		this.moddingFile = this.getFile(this.flameworkRootDir + "/modding");
		this.flameworkFile = this.getFile(this.flameworkRootDir + "/flamework");

		const serviceDecorator = this.flameworkFile.get("Service");
		const controllerDecorator = this.flameworkFile.get("Controller");
		const singletonDecorator = this.flameworkFile.get("Singleton");

		this.decorators = new Set([serviceDecorator, controllerDecorator, singletonDecorator]);

		const macroManager = this.services.macroManager;
		macroManager.addCallMacro(this.flameworkFile.get("Dependency"), FLAMEWORK_CALL_MACROS.Dependency);

		this.flamework = this.flameworkFile.getNamespace("Flamework");
		for (const [id, macro] of Object.entries(FLAMEWORK_PROPERTY_CALL_MACROS)) {
			macroManager.addPropertyCallMacro(this.flamework.get(id), macro);
		}

		const modding = this.moddingFile.getNamespace("Modding");
		for (const [id, macro] of Object.entries(FLAMEWORK_MODDING_PROPERTY_CALL_MACROS)) {
			macroManager.addPropertyCallMacro(modding.get(id), macro);
		}
	}

	isFlameworkDecorator(symbol: ts.Symbol) {
		return this.decorators.has(symbol);
	}

	registerInterestingFiles() {
		for (const file of this.program.getSourceFiles()) {
			if (this.isFileInteresting(file)) {
				this.registerFileSymbol(file);
			}
		}

		this.finalize();
	}
}

function isNamespaceDeclaration(node?: ts.Node): node is ts.NamespaceDeclaration {
	return (
		(node !== undefined &&
			ts.isModuleDeclaration(node) &&
			isIdentifier(node.name) &&
			node.body &&
			ts.isNamespaceBody(node.body)) ||
		false
	);
}

class FlameworkModuleFile {
	public fileSymbol: ts.Symbol;
	namespaces = new Map<string, FlameworkNamespace>();

	public constructor(
		public readonly typeChecker: ts.TypeChecker,
		private readonly file: ts.SourceFile,
		private name: string,
	) {
		const fileSymbol = typeChecker.getSymbolAtLocation(file);
		assert(fileSymbol);
		this.fileSymbol = fileSymbol;
		this.register();
	}

	private register() {
		for (const statement of this.file.statements) {
			if (isNamespaceDeclaration(statement)) {
				this.registerNamespace(statement);
			}
		}
	}

	private registerNamespace(node: ts.NamespaceDeclaration) {
		assert(ts.isModuleBlock(node.body));

		const namespaceSymbol = new FlameworkNamespace(this, node);
		this.namespaces.set(node.name.text, namespaceSymbol);
	}

	get(name: string) {
		const exportSymbol = this.fileSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol);

		return exportSymbol;
	}

	getNamespace(name: string) {
		const ns = this.namespaces.get(name);
		assert(ns);
		return ns;
	}
}

class FlameworkNamespace {
	public namespaceSymbol: ts.Symbol;

	public constructor(
		private readonly fileSymbol: FlameworkModuleFile,
		private readonly node: ts.NamespaceDeclaration,
	) {
		const namespaceSymbol = fileSymbol.typeChecker.getSymbolAtLocation(node.name);
		assert(namespaceSymbol);
		this.namespaceSymbol = namespaceSymbol;
	}

	get(name: string) {
		const exportSymbol = this.namespaceSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol, `Name ${name} not found in ${this.namespaceSymbol.name}`);

		return exportSymbol;
	}
}
