import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { FlameworkClassInfo, FlameworkDecoratorInfo } from "TSTransformer/flamework";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getFlameworkNodeUid, getFlameworkSymbolUid } from "TSTransformer/util/flameworkId";
import ts, { ClassLikeDeclaration } from "typescript";

export function isFlameworkSingleton(state: TransformState, node: ts.ClassLikeDeclaration) {
	if (!state.flamework) return false;
	const symbol = state.services.macroManager.getSymbolFromNode(node);
	const internalId = getFlameworkNodeUid(state, node);

	if (!node.name || !symbol || !internalId) return;

	const decorators = new Array<FlameworkDecoratorInfo>();

	let hasFlameworkDecorators = false;
	const nodeDecorators = ts.getDecorators(node);
	if (nodeDecorators) {
		for (const decorator of nodeDecorators) {
			if (!ts.isCallExpression(decorator.expression)) continue;
			const symbol = state.services.macroManager.getSymbolFromNode(decorator.expression.expression);
			if (!symbol) continue;
			if (!symbol.declarations?.[0]) continue;
			if (!ts.isIdentifier(decorator.expression.expression)) continue;

			const name = decorator.expression.expression.text;
			const isFlameworkDecorator = state.flamework.isFlameworkDecorator(symbol);
			if (isFlameworkDecorator) {
				hasFlameworkDecorators = true;
			}

			decorators.push({
				type: "WithNodes",
				declaration: symbol.declarations[0],
				arguments: decorator.expression.arguments.map(x => x),
				internalId: getFlameworkSymbolUid(state, symbol),
				isFlameworkDecorator,
				name,
				symbol,
			});
		}
	}

	if (hasFlameworkDecorators) {
		const classInfo: FlameworkClassInfo = {
			name: node.name.text,
			internalId,
			node,
			decorators,
			symbol,
		};

		state.airshipBuildState.classes.set(symbol, classInfo);
		return true;
	}

	return false;
}

function identifierMetadata(state: TransformState, node: ClassLikeDeclaration): luau.CallStatement {
	assert(node.name);
	assert(state.flamework);

	const flameworkImportId = state.addFileImport(state.flamework!.flameworkRootDir + "/index", "Reflect");
	const Reflect_defineMetadata = luau.property(flameworkImportId, "defineMetadata");

	return luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(Reflect_defineMetadata, [
			transformExpression(state, node.name),
			luau.string("identifier"),
			luau.string(getFlameworkNodeUid(state, node)!),
		]),
	});
}

function getDecoratorArguments(state: TransformState, decorator: ts.LeftHandSideExpression) {
	if (!ts.isCallExpression(decorator)) {
		return luau.array();
	}

	return luau.array(decorator.arguments.map(arg => transformExpression(state, arg)));
}

function decorate(
	state: TransformState,
	object: luau.AnyIdentifier,
	decoratorId: luau.StringLiteral,
	decorator: luau.AnyIdentifier,
	args: luau.Array,
) {
	const flameworkImportId = state.addFileImport(state.flamework!.flameworkRootDir + "/index", "Reflect");
	const Reflect_decorate = luau.property(flameworkImportId, "decorate");

	return luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(Reflect_decorate, [object, decoratorId, decorator, args]),
	});
}

export function isFlameworkDecorator(
	state: TransformState,
	decorator: ts.Decorator,
): decorator is ts.Decorator & { expression: ts.CallExpression | ts.Identifier } {
	const expr = decorator.expression;
	const type = state.typeChecker.getTypeAtLocation(expr);
	return type.getProperty("_flamework_Decorator") !== undefined;
}

function generateDecoratorMetadata(state: TransformState, node: ClassLikeDeclaration) {
	const list = luau.list.make<luau.Statement>();

	const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;

	if (decorators) {
		for (const decorator of decorators) {
			if (isFlameworkDecorator(state, decorator)) {
				const expr = decorator.expression;
				const identifier = ts.isCallExpression(expr) ? expr.expression : expr;
				const symbol = state.services.macroManager.getSymbolFromNode(identifier);
				assert(symbol);
				assert(symbol.valueDeclaration);
				assert(ts.isIdentifier(identifier));

				luau.list.push(
					list,
					decorate(
						state,
						luau.id(node.name!.text),
						luau.string(getFlameworkSymbolUid(state, symbol)),
						luau.id(identifier.text),
						getDecoratorArguments(state, expr),
					),
				);
			}
		}
	}

	return list;
}

function implementsClauses(state: TransformState, node: ClassLikeDeclaration, list: ReadonlyArray<string>) {
	const flameworkImportId = state.addFileImport(state.flamework!.flameworkRootDir + "/index", "Reflect");
	const Reflect_defineMetadata = luau.property(flameworkImportId, "defineMetadata");

	return luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(Reflect_defineMetadata, [
			transformExpression(state, node.name!),
			luau.string("flamework:implements"),
			luau.array(list.map(f => luau.string(f))),
		]),
	});
}

function generateMethodMetadata(state: TransformState, method: ts.FunctionLikeDeclaration): luau.List<luau.Statement> {
	const flameworkImportId = state.addFileImport(state.flamework!.flameworkRootDir + "/index", "Reflect");
	const Reflect_defineMetadata = luau.property(flameworkImportId, "defineMetadata");

	const list = luau.list.make<luau.Statement>();

	const parameters = new Array<string>();
	for (const parameter of method.parameters) {
		if (parameter.type) {
			const id = getFlameworkNodeUid(state, parameter.type);
			parameters.push(id || "$p:error");
		}
	}

	if (parameters.length > 0) {
		luau.list.push(
			list,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(Reflect_defineMetadata, [
					transformExpression(state, (method.parent as ts.ClassLikeDeclaration).name!),
					luau.string("flamework:parameters"),
					luau.array(parameters.map(param => luau.string(param))),
				]),
			}),
		);
	}

	return list;
}

export function generateFlameworkMetadataForClass(state: TransformState, node: ClassLikeDeclaration) {
	const list = luau.list.make<luau.Statement>();
	if (!node.name) return list;

	const classSymbol = state.services.macroManager.getSymbolFromNode(node);
	if (!classSymbol) return list;

	const classInfo = state.airshipBuildState.classes.get(classSymbol);
	if (!classInfo) return list;

	luau.list.push(list, identifierMetadata(state, node));

	if (node.heritageClauses) {
		const implementsList = new Array<string>();
		for (const clause of node.heritageClauses) {
			if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;

			for (const type of clause.types) {
				const id = getFlameworkNodeUid(state, type);
				if (!id) continue;
				implementsList.push(id);
			}
		}

		if (implementsList.length > 0) {
			luau.list.push(list, implementsClauses(state, node, implementsList));
		}
	}

	// Constructor metadata
	const constructor = node.members.find((member): member is ts.ConstructorDeclaration =>
		ts.isConstructorDeclaration(member),
	);
	if (constructor) {
		// Handle dependency injection
		luau.list.pushList(list, generateMethodMetadata(state, constructor));
	}

	// Reflect.decorate(<Object>, "<ID>", <OBJ>, { <...ARGS> })
	luau.list.pushList(list, generateDecoratorMetadata(state, node));

	return list;
}
