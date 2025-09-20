import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import {
	createLuauForStatement,
	createLuauIfStatement,
	createLuauVariableDeclaration,
} from "TSTransformer/util/luauExpressions";
import { isArrayLikeTypeWithUndefined } from "TSTransformer/util/types";
import ts from "typescript";

export function createArrayCountExpression(
	state: TransformState,
	node: ts.Expression,
	expression: luau.Expression,
): luau.Expression {
	const type = state.getType(node);
	if (isArrayLikeTypeWithUndefined(state, type)) {
		const counterStatements = luau.list.make<luau.Statement>();

		const counterId = luau.tempId("count");

		// const arrId = state.pushToVar(expression);

		luau.list.push(counterStatements, createLuauVariableDeclaration(counterId, luau.number(0)));

		const tempId = luau.tempId("k");

		luau.list.push(
			counterStatements,
			createLuauForStatement(
				luau.list.make(tempId),
				expression,
				luau.list.make(
					createLuauIfStatement(
						// luau.binary(
						// 	luau.binary(luau.call(luau.globals.typeof, [tempId]), "==", luau.string("number")),
						// 	"and",
						luau.binary(tempId, ">", counterId),
						// ),
						luau.list.make<luau.Statement>(
							luau.create(luau.SyntaxKind.Assignment, {
								left: counterId,
								operator: "=",
								right: tempId,
							}),
						),
					),
				),
			),
		);

		state.prereqList(counterStatements);
		return counterId;
	}

	return luau.unary("#", expression);
}
