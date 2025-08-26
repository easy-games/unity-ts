import luau from "@roblox-ts/luau-ast";
import { CompliationContext, TransformState } from "TSTransformer/classes/TransformState";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import ts, { MethodDeclaration } from "typescript";

function getReturnType(state: TransformState, method: MethodDeclaration): ts.Type | undefined {
	const methodType = state.typeChecker.getSignatureFromDeclaration(method);
	return methodType?.getReturnType();
}

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
	shouldAssert = false,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();
	const methodBody = luau.list.make<luau.Statement>();

	const name = transformPropertyName(state, method.name);

	const type = getReturnType(state, method);
	const isVoidReturn = state.typeChecker.getVoidType() === type || state.typeChecker.getUndefinedType() === type;

	if (luau.isStringLiteral(name)) {
		if (!isVoidReturn || shouldAssert) {
			luau.list.push(
				methodBody,
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.error, [
						luau.string(
							`Attempted to call ${state.isClientContext ? "server" : "client"}-only method '${
								name.value
							}'!`,
						),
						luau.number(2),
					]),
				}),
			);
		} else {
			luau.list.push(methodBody, luau.comment(" ► Method has no expected return values"));
		}

		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.MethodDeclaration, {
				expression: internalName,
				name: name.value,
				parameters: luau.list.make(),
				statements: methodBody,
				hasDotDotDot: false,
			}),
		);
	}

	return statements;
}

export function createStripReturn(
	state: TransformState,
	name: string,
	method: ts.MethodDeclaration,
	context: CompliationContext,
	shouldAssert = false,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();

	const type = getReturnType(state, method);
	const isVoidReturn = state.typeChecker.getVoidType() === type || state.typeChecker.getUndefinedType() === type;

	const methodStatements = luau.list.make<luau.Statement>();
	if (!isVoidReturn || shouldAssert) {
		luau.list.push(
			methodStatements,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.error, [
					luau.string(`Attempt to call context stripped method '${name}'`),
					luau.number(2),
				]),
			}),
		);
	} else {
		luau.list.push(
			methodStatements,
			luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.list.make() }),
		);
	}

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.IfStatement, {
			statements: methodStatements,
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
