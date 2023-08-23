import { RbxPath, RbxPathParent, RojoResolver } from "@easy-games/unity-rojo-resolver";
import luau from "@roblox-ts/luau-ast";
import path from "path";
import { ProjectType } from "Shared/constants";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";
import { makePosixPath } from "TSTransformer/util/makePosixPath";
import ts from "typescript";

function getAbsoluteImport(moduleRbxPath: string): Array<luau.Expression<luau.SyntaxKind>> {
	// let split = moduleRbxPath.split("/");
	const pathExpressions = new Array<luau.Expression>();
	// const serviceName = split[0];
	// assert(serviceName);

	// let stringPath = "";
	// for (let i = 0; i < split.length; i++) {
	// 	stringPath += split[i];
	// 	if (i + 1 < split.length) {
	// 		stringPath += "/";
	// 	}
	// }

	pathExpressions.push(luau.string(moduleRbxPath));
	return pathExpressions;
}

function getRelativeImport(sourceRbxPath: RbxPath, moduleRbxPath: RbxPath) {
	const relativePath = RojoResolver.relative(sourceRbxPath, moduleRbxPath);

	let stringPath = "";

	// create descending path pieces
	const path = new Array<string>();
	let i = 0;
	while (relativePath[i] === RbxPathParent) {
		if (i === 0) {
			stringPath += "./";
		} else {
			stringPath += "../";
		}
		i++;
	}
	path.push(stringPath);

	const pathExpressions = new Array<luau.Expression>();

	// create descending path pieces
	for (; i < relativePath.length; i++) {
		const pathPart = relativePath[i];
		assert(typeof pathPart === "string");
		stringPath += pathPart;

		if (i + 1 < relativePath.length) {
			stringPath += "/";
		}
	}

	pathExpressions.push(luau.string(stringPath));

	// debugger;
	return pathExpressions;
}

function validateModule(state: TransformState, scope: string) {
	const scopedModules = path.join(state.data.nodeModulesPath, scope);
	if (state.compilerOptions.typeRoots) {
		for (const typeRoot of state.compilerOptions.typeRoots) {
			if (path.normalize(scopedModules) === path.normalize(typeRoot)) {
				return true;
			}
		}
	}
	return false;
}

function findRelativeRbxPath(moduleOutPath: string, pkgRojoResolvers: Array<RojoResolver>) {
	for (const pkgRojoResolver of pkgRojoResolvers) {
		const relativeRbxPath = pkgRojoResolver.getRbxPathFromFilePath(moduleOutPath);
		if (relativeRbxPath) {
			return relativeRbxPath;
		}
	}
}

// function getNodeModulesImportParts(
// 	state: TransformState,
// 	sourceFile: ts.SourceFile,
// 	moduleSpecifier: ts.Expression,
// 	moduleOutPath: string,
// ) {
// 	const moduleScope = path.relative(state.data.nodeModulesPath, moduleOutPath).split(path.sep)[0];
// 	assert(moduleScope);

// 	if (!moduleScope.startsWith("@")) {
// 		DiagnosticService.addDiagnostic(errors.noUnscopedModule(moduleSpecifier));
// 		return [];
// 	}

// 	if (!validateModule(state, moduleScope)) {
// 		DiagnosticService.addDiagnostic(errors.noInvalidModule(moduleSpecifier));
// 		return [];
// 	}

// 	if (state.projectType === ProjectType.Package) {
// 		const relativeRbxPath = findRelativeRbxPath(moduleOutPath, state.pkgRojoResolvers);
// 		if (!relativeRbxPath) {
// 			DiagnosticService.addDiagnostic(
// 				errors.noRojoData(moduleSpecifier, path.relative(state.data.projectPath, moduleOutPath), true),
// 			);
// 			return [];
// 		}

// 		let modulePath = moduleOutPath.split("node_modules/")[1];
// 		modulePath = modulePath.split(".lua")[0];
// 		modulePath = NODE_MODULES_PATH + modulePath;
// 		assert(modulePath);
// 		// debugger;

// 		return [luau.string(modulePath)];

// 		// const moduleName = relativeRbxPath[0];
// 		// assert(moduleName);

// 		// debugger;

// 		// return [
// 		// 	propertyAccessExpressionChain(
// 		// 		luau.call(state.TS(moduleSpecifier.parent, "getModule"), [
// 		// 			luau.globals.script,
// 		// 			luau.string(moduleScope),
// 		// 			luau.string(moduleName),
// 		// 		]),
// 		// 		relativeRbxPath.slice(1),
// 		// 	),
// 		// ];
// 	} else {
// 		const moduleRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
// 		if (!moduleRbxPath) {
// 			DiagnosticService.addDiagnostic(
// 				errors.noRojoData(moduleSpecifier, path.relative(state.data.projectPath, moduleOutPath), true),
// 			);
// 			return [];
// 		}

// 		const indexOfScope = moduleRbxPath.indexOf(moduleScope);
// 		if (indexOfScope === -1 || moduleRbxPath[indexOfScope - 1] !== NODE_MODULES) {
// 			DiagnosticService.addDiagnostic(
// 				errors.noPackageImportWithoutScope(
// 					moduleSpecifier,
// 					path.relative(state.data.projectPath, moduleOutPath),
// 					moduleRbxPath,
// 				),
// 			);
// 			return [];
// 		}

// 		return getImportParts(state, sourceFile, moduleSpecifier, moduleOutPath, moduleRbxPath);
// 	}
// }

// function getImportParts(
// 	state: TransformState,
// 	sourceFile: ts.SourceFile,
// 	moduleSpecifier: ts.Expression,
// 	moduleOutPath: string,
// 	moduleRbxPath: RbxPath,
// ) {
// 	const moduleRbxType = state.rojoResolver.getRbxTypeFromFilePath(moduleOutPath);
// 	if (moduleRbxType === RbxType.Script || moduleRbxType === RbxType.LocalScript) {
// 		DiagnosticService.addDiagnostic(errors.noNonModuleImport(moduleSpecifier));
// 		return [];
// 	}

// 	const sourceOutPath = state.pathTranslator.getOutputPath(sourceFile.fileName);
// 	// const unityPath = state.pathTranslator.getUnityPathFromTSFilePath(sourceOutPath);
// 	const sourceRbxPath = state.rojoResolver.getRbxPathFromFilePath(sourceOutPath);
// 	// if (!sourceRbxPath) {
// 	// 	DiagnosticService.addDiagnostic(
// 	// 		errors.noRojoData(sourceFile, path.relative(state.data.projectPath, sourceOutPath), false),
// 	// 	);
// 	// 	return [];
// 	// }

// 	return [];
// 	// if (state.projectType === ProjectType.Game) {
// 	// 	return getAbsoluteImport(moduleRbxPath);
// 	// } else {
// 	// 	return getRelativeImport(sourceRbxPath, moduleRbxPath);
// 	// }
// }

// export function getAirshipImportParts(
// 	state: TransformState,
// 	sourceFile: ts.SourceFile,
// 	moduleSpecifier: ts.Expression,
// 	moduleOutPath: string,
// ): Array<luau.Expression> {
// 	LogService.writeLine("moduleOutPath: " + moduleOutPath);

// 	return [];
// }

export function createImportExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	moduleSpecifier: ts.Expression,
): luau.IndexableExpression {
	const moduleFile = getSourceFileFromModuleSpecifier(state, moduleSpecifier);
	if (!moduleFile) {
		DiagnosticService.addDiagnostic(errors.noModuleSpecifierFile(moduleSpecifier));
		return luau.none();
	}

	const virtualPath = state.guessVirtualPath(moduleFile.fileName);
	const isInsideNodeModules = ts.isInsideNodeModules(virtualPath);

	let moduleOutPath = isInsideNodeModules
		? state.pathTranslator.getImportPath(
				state.nodeModulesPathMapping.get(getCanonicalFileName(path.normalize(virtualPath))) ?? virtualPath,
				/* isNodeModule */ true,
		  )
		: state.pathTranslator.getImportPath(virtualPath);

	moduleOutPath = makePosixPath(moduleOutPath);
	// LogService.writeLine("import before=" + moduleOutPath);

	if (state.projectType === ProjectType.Package) {
		const packageName = state.data.projectOptions.nodePackageName!;
		// LogService.writeLine("packageName=" + packageName);
		const split = moduleOutPath.split(packageName);

		/**
		 * Special case: Github Actions
		 * Example path: /home/runner/work/flamework-core/flamework-core/out/modding.lua
		 */
		if (split.length >= 3) {
			moduleOutPath =
				"Imports/Core/Shared/Resources/TSExtra/node_modules/@easy-games/" +
				packageName +
				split[split.length - 1];
		} else {
			moduleOutPath = "Imports/Core/Shared/Resources/TSExtra/node_modules/@easy-games/" + packageName + split[1];
		}
	} else if (isInsideNodeModules) {
		let split = moduleOutPath.split("node_modules/");
		moduleOutPath = split[1];
		moduleOutPath = "Imports/Core/Shared/Resources/TSExtra/node_modules/" + moduleOutPath;
	} else if (moduleOutPath.includes("Types~")) {
		let split = moduleOutPath.split("Types~");
		moduleOutPath = "Imports" + split[1];

		moduleOutPath = moduleOutPath.replace("Shared/", "Shared/Resources/TS/");
		moduleOutPath = moduleOutPath.replace("Server/", "Server/Resources/TS/");
		moduleOutPath = moduleOutPath.replace("Client/", "Client/Resources/TS/");
	} else {
		// LogService.writeLine("path: " + moduleOutPath);
		moduleOutPath = moduleOutPath.replace("Shared/", "Shared/Resources/TS/");
		moduleOutPath = moduleOutPath.replace("Server/", "Server/Resources/TS/");
		moduleOutPath = moduleOutPath.replace("Client/", "Client/Resources/TS/");
	}

	if (moduleOutPath.includes("/Assets/Bundles/")) {
		moduleOutPath = moduleOutPath.split("/Assets/Bundles/")[1];
	}

	moduleOutPath = moduleOutPath.replace(".lua", "");

	// LogService.writeLine("import after=" + moduleOutPath);
	const parts = new Array<luau.Expression>();
	parts.push(...getAbsoluteImport(moduleOutPath));

	// if (isInsideNodeModules) {
	// 	parts.push(...getNodeModulesImportParts(state, sourceFile, moduleSpecifier, moduleOutPath));
	// } else {
	// 	if (moduleOutPath.includes("/TS/types/")) {
	// 		console.log("skipping types import.");
	// 		// return luau.none();
	// 	}

	// 	const moduleRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
	// 	if (!moduleRbxPath) {
	// 		DiagnosticService.addDiagnostic(
	// 			errors.noRojoData(moduleSpecifier, path.relative(state.data.projectPath, moduleOutPath), false),
	// 		);
	// 		return luau.none();
	// 	}
	// 	parts.push(...getImportParts(state, sourceFile, moduleSpecifier, moduleOutPath, moduleRbxPath));
	// }

	return luau.call(luau.globals.require, parts);
}
