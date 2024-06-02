import fs from "fs";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { ProjectData, ProjectOptions } from "Shared/types";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

const moduleResolutionCache = new Map<string, string | false>();

export class FlameworkSymbolProvider {
	public usesFlamework = false;
	public usesModding = false;
	public usesReflect = false;

	public flameworkRootDir = "AirshipPackages/@Easy/Core/Shared/Flamework";
	private flameworkDir = this.resolveModuleDir(this.flameworkRootDir);

	constructor(
		private readonly program: ts.Program,
		private readonly compilerOptions: ts.CompilerOptions,
		private readonly data: ProjectData,
	) {}

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

	private isFileInteresting(file: ts.SourceFile) {
		if (this.flameworkDir && isPathDescendantOf(file.fileName, this.flameworkDir)) {
			return true;
		}

		return false;
	}

	private finalize() {
		LogService.writeLine("(Internal) flamework located at: " + this.flameworkDir);
	}

	registerInterestingFiles() {
		for (const file of this.program.getSourceFiles()) {
			if (this.isFileInteresting(file)) {
				// this.registerFileSymbol(file);
			}
		}

		this.finalize();
	}
}
