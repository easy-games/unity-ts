import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { isArrayType, isDefinitelyType, isGeneratorType, isMapType, isSetType } from "TSTransformer/util/types";
import ts from "typescript";

type BindingDestructor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) => luau.Expression;

export function getDestructorForSetType(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) {
	const extracted = state.pushToVar(luau.set(idStack), "extracted");
	const rest = state.pushToVar(luau.array(), "rest");
	const keyId = luau.tempId("k");

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId),
			expression: parentId,
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary(
						"not",
						luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: extracted,
							index: keyId,
						}),
					),
					elseBody: luau.list.make(),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.CallStatement, {
							expression: luau.call(luau.globals.table.insert, [rest, keyId]),
						}),
					),
				}),
			),
		}),
	);
	return rest;
}

export function getDestructorForArrayType(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
): luau.Expression {
	const numElements = luau.unary("#", parentId);

	const numElementsId = luau.tempId("len");
	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: numElementsId,
			right: numElements,
		}),
	);

	const preallocTable = luau.call(luau.globals.table.create, [luau.binary(numElementsId, "-", luau.number(index))]);
	return luau.call(luau.globals.table.move, [
		parentId, // src
		luau.number(index + 1), // src[n]
		numElementsId, // #src
		luau.number(1), // dst[1]
		preallocTable, // table.create(#src - n), prealloc table
	]);
}

export function getDestructorForMapType(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) {
	const extracted = state.pushToVar(luau.set(idStack), "extracted");
	const rest = state.pushToVar(luau.array(), "rest");

	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId, valueId),
			expression: parentId,
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary(
						"not",
						luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: extracted,
							index: keyId,
						}),
					),
					elseBody: luau.list.make(),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.CallStatement, {
							expression: luau.call(luau.globals.table.insert, [
								rest,
								luau.create(luau.SyntaxKind.Array, {
									members: luau.list.make(keyId, valueId),
								}),
							]),
						}),
					),
				}),
			),
		}),
	);
	return rest;
}
export function getDestructorForGeneratorType(state: TransformState, parentId: luau.AnyIdentifier) {
	const restId = state.pushToVar(luau.array(), "rest");

	const valueId = luau.tempId("v");
	const variable = luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: valueId,
		right: luau.call(luau.property(parentId, "next")),
	});

	const doneCheck = luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.create(luau.SyntaxKind.BinaryExpression, {
			left: luau.property(valueId, "done"),
			operator: "==",
			right: luau.create(luau.SyntaxKind.TrueLiteral, {}),
		}),
		elseBody: luau.list.make(),
		statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
	});

	const pushToRest = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.globals.table.insert, [restId, luau.property(valueId, "value")]),
	});

	state.prereq(
		luau.create(luau.SyntaxKind.WhileStatement, {
			condition: luau.create(luau.SyntaxKind.TrueLiteral, {}),
			statements: luau.list.make<luau.Statement>(variable, doneCheck, pushToRest),
		}),
	);

	return restId;
}

export function getDestructorForBindingType(state: TransformState, node: ts.Node, type: ts.Type): BindingDestructor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return getDestructorForArrayType;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return getDestructorForSetType;
	} else if (isDefinitelyType(type, isMapType(state))) {
		return getDestructorForMapType;
	} else if (isDefinitelyType(type, isGeneratorType(state))) {
		return getDestructorForGeneratorType;
	}

	return () => {
		DiagnosticService.addDiagnostic(errors.unsupportedSpreadDestructing(node, state.typeChecker, type));
		return luau.none();
	};
}
