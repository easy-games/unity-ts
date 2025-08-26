import luau from "@roblox-ts/luau-ast";
import { CompliationContext, TransformState } from "TSTransformer/classes/TransformState";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import ts from "typescript";

export function hasDecoratorByName(state: TransformState, decorators: Array<ts.Decorator>, name: "Client" | "Server") {
	const symbol = state.services.macroManager.getSymbolOrThrow(name);

	for (const { expression } of decorators) {
		if (!ts.isCallExpression(expression)) continue;
		if (!ts.isIdentifier(expression.expression)) continue;

		const symbolOfExpression = state.typeChecker.getSymbolAtLocation(expression.expression);
		if (symbolOfExpression === symbol) return true;
	}

	return false;
}

export function createStripMethod(
	state: TransformState,
	method: ts.MethodDeclaration,
	internalName: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();
	const name = transformPropertyName(state, method.name);

	if (luau.isStringLiteral(name)) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.MethodDeclaration, {
				expression: internalName,
				name: name.value,
				parameters: luau.list.make(),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(luau.globals.error, [
							luau.string(`Attempt to call context stripped method '${name.value}'`),
							luau.number(2),
						]),
					}),
				),
				hasDotDotDot: true,
			}),
		);
	}

	return statements;
}

export function createStripReturn(
	state: TransformState,
	name: string,
	context: CompliationContext,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.IfStatement, {
			statements: luau.list.make<luau.Statement>(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.error, [
						luau.string(`Attempt to call context stripped method '${name}'`),
						luau.number(2),
					]),
				}),
				// luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }),
			),
			condition: luau.create(luau.SyntaxKind.UnaryExpression, {
				expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
					expression: luau.id("Game"),
					name: context === CompliationContext.Server ? "IsServer" : "IsClient",
					args: luau.list.make(),
				}),
				operator: "not",
			}),
			elseBody: luau.list.make(),
		}),
	);

	return statements;
}

export function getStrippableMethodType(
	state: TransformState,
	method: ts.MethodDeclaration,
): CompliationContext | undefined {
	if (!method.modifiers) return;
	const decorators = method.modifiers?.filter(f => ts.isDecorator(f));
	if (!decorators) return;

	if (hasDecoratorByName(state, decorators, "Server") && !state.isServerContext) {
		return CompliationContext.Server;
	} else if (hasDecoratorByName(state, decorators, "Client") && !state.isClientContext) {
		return CompliationContext.Client;
	}

	return;
}

export function isStrippableContextMethod(state: TransformState, method: ts.MethodDeclaration) {
	if (!method.modifiers) return;
	const decorators = method.modifiers?.filter(f => ts.isDecorator(f));
	if (!decorators) return false;

	if (hasDecoratorByName(state, decorators, "Server") && !state.isServerContext) {
		return true;
	} else if (hasDecoratorByName(state, decorators, "Client") && !state.isClientContext) {
		return true;
	}

	return false;
}
