import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { SINGLETON_FILE_IMPORT, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isAirshipBehaviourReserved } from "TSTransformer/macros/propertyMacros";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isRootAirshipBehaviourClass, isRootAirshipSingletonClass } from "TSTransformer/util/extendsAirshipBehaviour";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

function createAirshipSingletonBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.AnyIdentifier,
	statements: luau.List<luau.Statement>,
) {
	const importId = state.getOrAddFileImport(SINGLETON_FILE_IMPORT, "SingletonRegistry");
	const Singletons_Find = luau.property(importId, "Find");
	const Singletons_Register = luau.property(importId, "Register");

	// if TRUE
	const ifExistsStatements = luau.list.make<luau.Statement>();
	{
		luau.list.push(
			ifExistsStatements,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.error, [
					luau.string("Singleton '" + name.name + "' already exists"),
				]),
			}),
		);
		luau.list.push(
			ifExistsStatements,
			luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.list.make() }),
		);
	}

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.call(Singletons_Find, [luau.string(name.name)]),
			statements: ifExistsStatements,
			elseBody: luau.list.make(),
		}),
	);

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(Singletons_Register, [luau.string(name.name), luau.globals.self]),
		}),
	);
}

export function transformClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.AnyIdentifier,
	originNode?: ts.ConstructorDeclaration & { body: ts.Block },
) {
	const statements = luau.list.make<luau.Statement>();

	let bodyStatements = originNode ? getStatements(originNode.body) : [];

	const isAirshipSingleton = isRootAirshipSingletonClass(state, node);
	const isAirshipBehaviour = isRootAirshipBehaviourClass(state, node);
	let removeFirstSuper = isAirshipBehaviour || isAirshipSingleton;

	let parameters = luau.list.make<luau.AnyIdentifier>();
	let hasDotDotDot = false;
	if (originNode) {
		const {
			statements: paramStatements,
			parameters: constructorParams,
			hasDotDotDot: constructorHasDotDotDot,
		} = transformParameters(state, originNode);
		luau.list.pushList(statements, paramStatements);
		parameters = constructorParams;
		hasDotDotDot = constructorHasDotDotDot;
	} else if (getExtendsNode(node) && !isAirshipBehaviour && !isAirshipSingleton) {
		// if extends + no constructor:
		// - add ... to params
		// - add super.constructor(self, ...)
		hasDotDotDot = true;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.property(luau.globals.super, "constructor"), [
					luau.globals.self,
					luau.create(luau.SyntaxKind.VarArgsLiteral, {}),
				]),
			}),
		);
	}

	// property parameters must come after the first super() call
	function transformFirstSuper() {
		if (!removeFirstSuper) {
			removeFirstSuper = true;
			if (bodyStatements.length > 0) {
				const firstStatement = bodyStatements[0];
				if (ts.isExpressionStatement(firstStatement) && ts.isSuperCall(firstStatement.expression)) {
					luau.list.pushList(statements, transformStatementList(state, [firstStatement]));
				}
			}
		}
	}

	for (const parameter of originNode?.parameters ?? []) {
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			transformFirstSuper();
			const paramId = transformIdentifierDefined(state, parameter.name);
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.property(luau.globals.self, paramId.name),
					operator: "=",
					right: paramId,
				}),
			);
		}
	}

	for (const member of node.members) {
		if (ts.isPropertyDeclaration(member) && !ts.hasStaticModifier(member)) {
			transformFirstSuper();

			const name = member.name;
			if (ts.isPrivateIdentifier(name)) {
				DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node));
				continue;
			}

			const initializer = member.initializer;
			if (!initializer) {
				continue;
			}

			if (
				ts.isIdentifier(member.name) &&
				(isAirshipSingleton || isAirshipBehaviour) &&
				isAirshipBehaviourReserved(member.name.text)
			) {
				DiagnosticService.addDiagnostic(errors.noReservedAirshipIdentifier(member.name));
			}

			const [index, indexPrereqs] = state.capture(() => transformPropertyName(state, name));
			luau.list.pushList(statements, indexPrereqs);

			const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));
			luau.list.pushList(statements, rightPrereqs);

			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: luau.globals.self,
						index,
					}),
					operator: "=",
					right,
				}),
			);
		}
	}

	// if removeFirstSuper and first statement is `super()`, remove it
	if (removeFirstSuper && bodyStatements.length > 0) {
		const firstStatement = bodyStatements[0];
		if (ts.isExpressionStatement(firstStatement) && ts.isSuperCall(firstStatement.expression)) {
			bodyStatements = bodyStatements.slice(1);
		}
	}

	if (isAirshipSingleton) {
		createAirshipSingletonBoilerplate(state, node, name, statements);
	}

	luau.list.pushList(statements, transformStatementList(state, bodyStatements));

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.MethodDeclaration, {
			expression: name,
			name: "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
