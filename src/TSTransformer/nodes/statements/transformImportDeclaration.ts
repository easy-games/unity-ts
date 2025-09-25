import luau from "@roblox-ts/luau-ast";
import { Lazy } from "Shared/classes/Lazy";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { cleanModuleName } from "TSTransformer/util/cleanModuleName";
import { createImportExpression } from "TSTransformer/util/createImportExpression";
import { isAirshipSingletonType, isClassInheritingSymbol } from "TSTransformer/util/extendsAirshipBehaviour";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

function countImportExpUses(state: TransformState, importClause: ts.ImportClause) {
	let uses = 0;

	if (importClause.name) {
		const symbol = getOriginalSymbolOfNode(state.typeChecker, importClause.name);
		if (state.resolver.isReferencedAliasDeclaration(importClause) && (!symbol || isSymbolOfValue(symbol))) {
			uses++;
		}
	}

	if (importClause.namedBindings) {
		if (ts.isNamespaceImport(importClause.namedBindings)) {
			uses++;
		} else {
			for (const element of importClause.namedBindings.elements) {
				const symbol = getOriginalSymbolOfNode(state.typeChecker, element.name);
				if (state.resolver.isReferencedAliasDeclaration(element) && (!symbol || isSymbolOfValue(symbol))) {
					uses++;
				}
			}
		}
	}

	return uses;
}

export function isStaticAirshipSingletonPropertyAccess(
	state: TransformState,
	expression: ts.PropertyAccessExpression,
	singletonName: string,
): boolean {
	const symbolOfAccessExpression = state.typeChecker.getSymbolAtLocation(expression);
	if (!symbolOfAccessExpression) return false;

	const innerExpression = expression.expression;
	if (ts.isIdentifier(innerExpression)) {
		const expressionType = state.typeChecker.getDeclaredTypeOfSymbol(
			state.typeChecker.getSymbolAtLocation(innerExpression)!,
		);

		if (isAirshipSingletonType(state, expressionType)) {
			const expressionTypeName = state.typeChecker.typeToString(expressionType);
			if (expressionTypeName !== singletonName) return false;

			const callMacro = symbolOfAccessExpression
				? state.services.macroManager.findPropertyCallMacro(symbolOfAccessExpression)
				: undefined;
			if (callMacro === undefined) {
				return true;
			} else {
				return false;
			}
		}
	}

	return false;
}

function shouldSkipSingletonImport(
	state: TransformState,
	importDeclaration: ts.ImportDeclaration,
	module: ts.SourceFile,
	symbol: ts.Symbol,
) {
	const linkedModuleSingletonIds = state.airshipBuildState.singletonTypes.get(module.fileName) ?? new Set();

	const valueDeclaration = symbol.valueDeclaration;
	if (!valueDeclaration) return false;

	// get the value type of the import
	const valueType = state.typeChecker.getTypeAtLocation(valueDeclaration);

	if (!valueType) {
		return false;
	}

	// We don't care about non-class, or non-singleton class types
	if (!valueType.isClass() || !isAirshipSingletonType(state, valueType)) {
		return false;
	}

	const typeUniqueId = state.airshipBuildState.getUniqueIdForType(state, valueType, module);

	if (state.isPublish() && !linkedModuleSingletonIds.has(typeUniqueId)) {
		// Need to ensure we keep the import or strip it... Don't like this TBH
		return false;
	}

	const typeName = state.typeChecker.typeToString(valueType);

	// Ensure we're only using only a macro on the singleton
	let shouldSkip = true;
	ts.forEachChildRecursively(importDeclaration.getSourceFile(), node => {
		// If we have an inheriting singleton, we need to call the constructor of the base singleton
		if (ts.isClassLike(node) && isClassInheritingSymbol(state, node, symbol)) {
			shouldSkip = false;
			return "skip";
		}

		// Any static accesses of singletons
		if (ts.isPropertyAccessExpression(node) && isStaticAirshipSingletonPropertyAccess(state, node, typeName)) {
			shouldSkip = false;
			return "skip";
		}
	});

	return shouldSkip;
}

export function transformImportDeclaration(state: TransformState, node: ts.ImportDeclaration) {
	// no emit for type only
	const importClause = node.importClause;
	if (importClause && importClause.isTypeOnly) return luau.list.make<luau.Statement>();

	const statements = luau.list.make<luau.Statement>();

	assert(ts.isStringLiteral(node.moduleSpecifier));
	const importExp = new Lazy<luau.IndexableExpression>(() =>
		createImportExpression(state, node.getSourceFile(), node.moduleSpecifier),
	);

	if (importClause) {
		// TODO: How can we determine if this is a .d.ts file and ignore it?
		if (node.moduleSpecifier.text === "@easy-games/types/include/generated") {
			return luau.list.make<luau.Statement>();
		}
		// console.log("\ntext: " + node.moduleSpecifier.text);

		// detect if we need to push to a new var or not
		const uses = countImportExpUses(state, importClause);
		if (uses > 1) {
			const moduleName = node.moduleSpecifier.text.split("/");
			const id = luau.tempId(cleanModuleName(moduleName[moduleName.length - 1]));
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: id,
					right: importExp.get(),
				}),
			);
			importExp.set(id);
		}

		// default import logic
		const importClauseName = importClause.name;
		if (importClauseName) {
			const symbol = getOriginalSymbolOfNode(state.typeChecker, importClauseName);
			if (state.resolver.isReferencedAliasDeclaration(importClause) && (!symbol || isSymbolOfValue(symbol))) {
				const moduleFile = getSourceFileFromModuleSpecifier(state, node.moduleSpecifier);
				const moduleSymbol = moduleFile && state.typeChecker.getSymbolAtLocation(moduleFile);
				if (moduleSymbol && state.getModuleExports(moduleSymbol).some(v => v.name === "default")) {
					if (!shouldSkipSingletonImport(state, node, moduleFile, symbol!)) {
						luau.list.pushList(
							statements,
							state.capturePrereqs(() =>
								transformVariable(state, importClauseName, luau.property(importExp.get(), "default")),
							),
						);
					}
				} else {
					luau.list.pushList(
						statements,
						state.capturePrereqs(() => transformVariable(state, importClauseName, importExp.get())),
					);
				}
			}
		}

		const importClauseNamedBindings = importClause.namedBindings;
		if (importClauseNamedBindings) {
			// namespace import logic
			if (ts.isNamespaceImport(importClauseNamedBindings)) {
				luau.list.pushList(
					statements,
					state.capturePrereqs(() =>
						transformVariable(state, importClauseNamedBindings.name, importExp.get()),
					),
				);
			} else {
				// named elements import logic
				for (const element of importClauseNamedBindings.elements) {
					const symbol = getOriginalSymbolOfNode(state.typeChecker, element.name);

					if (symbol && state.services.macroManager.isMacroOnlySymbol(symbol)) {
						continue;
					}

					// check that import is referenced and has a value at runtime
					if (state.resolver.isReferencedAliasDeclaration(element) && (!symbol || isSymbolOfValue(symbol))) {
						luau.list.pushList(
							statements,
							state.capturePrereqs(() =>
								transformVariable(
									state,
									element.name,
									luau.property(importExp.get(), (element.propertyName ?? element.name).text),
								),
							),
						);
					}
				}
			}
		}
	}

	// ensure we emit something
	if (
		!importClause ||
		(state.compilerOptions.importsNotUsedAsValues === ts.ImportsNotUsedAsValues.Preserve &&
			luau.list.isEmpty(statements))
	) {
		const expression = importExp.get();
		if (luau.isCallExpression(expression)) {
			luau.list.push(statements, luau.create(luau.SyntaxKind.CallStatement, { expression }));
		}
	}

	return statements;
}
