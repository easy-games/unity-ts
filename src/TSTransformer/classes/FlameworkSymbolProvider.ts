import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import fs from "fs";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { ProjectData, ProjectOptions } from "Shared/types";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { MacroManager } from "TSTransformer/classes/MacroManager";
import { TransformState } from "TSTransformer/classes/TransformState";
import { FLAMEWORK_CALL_MACROS } from "TSTransformer/macros/flamework/callMacros";
import { TransformServices } from "TSTransformer/types";
import ts from "typescript";

const moduleResolutionCache = new Map<string, string | false>();
const EXCLUDED_NAME_DIR = new Set(["src/", "lib/", "out/"]);

export class FlameworkSymbolProvider {
	public fileSymbols = new Map<string, FlameworkModuleFile>();

	public moddingFile!: FlameworkModuleFile;
	public flameworkFile!: FlameworkModuleFile;

	public usesFlamework = false;
	public usesModding = false;
	public usesReflect = false;

	public flameworkRootDir = "AirshipPackages/@Easy/Core/Shared/Flamework";
	private flameworkDir = this.resolveModuleDir(this.flameworkRootDir);

	public readonly flameworkId = luau.tempId("FlameworkMacros");
	public readonly moddingId = luau.tempId("ModdingMacros");
	public readonly reflectionId = luau.tempId("ReflectMacros");

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
		console.log("name is", name);

		if (this.fileSymbols.has(name)) {
			LogService.warn("duplicate file symbol. name=" + name + ", fileName=" + file.fileName);
			return this.fileSymbols.get(name)!;
		}

		const fileSymbol = new FlameworkModuleFile(this.services.macroManager, file, name);
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

		const macroManager = this.services.macroManager;
		macroManager.addCallMacro(this.flameworkFile.get("Dependency"), FLAMEWORK_CALL_MACROS.Dependency);
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

class FlameworkModuleFile {
	public fileSymbol: ts.Symbol;

	public constructor(macros: MacroManager, private readonly file: ts.SourceFile, private name: string) {
		const fileSymbol = macros.getSymbolFromNode(file);
		assert(fileSymbol);
		this.fileSymbol = fileSymbol;

		console.log("register module", file.fileName, name, fileSymbol.name);
	}

	get(name: string) {
		const exportSymbol = this.fileSymbol.exports?.get(name as ts.__String);
		assert(exportSymbol);

		return exportSymbol;
	}
}
