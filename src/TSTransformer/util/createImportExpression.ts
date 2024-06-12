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
	const pathExpressions = new Array<luau.Expression>();
	pathExpressions.push(luau.string(moduleRbxPath));
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

	moduleOutPath = path.relative(state.pathTranslator.outDir, moduleOutPath);
	moduleOutPath = makePosixPath(moduleOutPath);

	moduleOutPath = moduleOutPath.replace(".lua", "");

	const parts = new Array<luau.Expression>();
	parts.push(...getAbsoluteImport(moduleOutPath));

	return luau.call(luau.globals.require, parts);
}
