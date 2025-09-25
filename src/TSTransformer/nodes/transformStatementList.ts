import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { isGuardClause } from "TSTransformer/macros/directives";
import {
	DirectiveIfBranch,
	transformDirectiveIfStatementInner,
} from "TSTransformer/macros/directives/transformDirectives";
import { parseDirectives } from "TSTransformer/macros/directives/transformGuardDirectives";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";
import ts from "typescript";

/**
 * Convert a ts.Statement array into a luau.list<...> tree
 * @param state The current state of the transformation.
 * @param statements The statements to transform into a `luau.list<...>`.
 * @param exportInfo Information about exporting.
 */
export function transformStatementList(
	state: TransformState,
	statements: ReadonlyArray<ts.Statement>,
	exportInfo?: {
		id: luau.AnyIdentifier;
		mapping: Map<ts.Statement, Array<string>>;
	},
) {
	// make a new Luau tree
	const result = luau.list.make<luau.Statement>();

	// iterate through each statement in the `statements` array
	for (let statement of statements) {
		let shouldEarlyReturn = false;

		if (!state.isSharedContext && ts.isIfStatement(statement)) {
			// If it's a guard clause (early return) we can check to see if we can strip the rest of the statements
			// One thing to note: if we have a complex directive expression - e.g. if ($SERVER && x > y) return; then we can't strip the rest.
			// 		It will just be a regular early return with x > y on the server, in that case.
			if (isGuardClause(state, statement, state.data.stripImplicitContextCalls)) {
				const directives = parseDirectives(
					state,
					statement.expression,
					true,
					state.data.stripImplicitContextCalls,
				);

				// $SERVER or !$CLIENT
				// if implicit, also Game.IsServer() and !Game.IsClient()
				if (directives?.isServer) {
					const transformResult = transformDirectiveIfStatementInner(
						state,
						statement,
						state.isServerContext,
						directives.updatedExpression,
						state.data.stripImplicitContextCalls,
					);

					if (transformResult.newStatement) {
						statement = transformResult.newStatement;
						shouldEarlyReturn =
							transformResult.branch === DirectiveIfBranch.IfTrue && !directives.isComplexDirectiveCheck;
					} else if (transformResult.skipped) {
						continue;
					}
				}
				// $CLIENT or !$SERVER
				// if implicit, also Game.IsClient() and !Game.IsServer()
				else if (directives?.isClient) {
					const transformResult = transformDirectiveIfStatementInner(
						state,
						statement,
						state.isClientContext,
						directives.updatedExpression,
						state.data.stripImplicitContextCalls,
					);

					if (transformResult.newStatement) {
						statement = transformResult.newStatement;
						shouldEarlyReturn =
							transformResult.branch === DirectiveIfBranch.IfTrue && !directives.isComplexDirectiveCheck;
					} else if (transformResult.skipped) {
						continue;
					}
				}
			}
		}

		// capture prerequisite statements for the `ts.Statement`
		// transform the statement into a luau.List<...>
		const [transformedStatements, prereqStatements] = state.capture(() => transformStatement(state, statement));

		// iterate through each of the leading comments of the statement
		if (state.compilerOptions.removeComments !== true) {
			luau.list.pushList(result, state.getLeadingComments(statement));
		}

		// check statement for hoisting
		// hoisting is the use of a variable before it was declared
		const hoistDeclaration = createHoistDeclaration(state, statement);
		if (hoistDeclaration) {
			luau.list.push(result, hoistDeclaration);
		}

		luau.list.pushList(result, prereqStatements);
		luau.list.pushList(result, transformedStatements);

		const lastStatement = transformedStatements.tail?.value;
		if (lastStatement && luau.isFinalStatement(lastStatement)) {
			break;
		}

		// namespace export handling
		if (exportInfo) {
			const containerId = exportInfo.id;
			const exportMapping = exportInfo.mapping.get(statement);
			if (exportMapping !== undefined) {
				for (const exportName of exportMapping) {
					luau.list.push(
						result,
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.property(containerId, exportName),
							operator: "=",
							right: luau.id(exportName),
						}),
					);
				}
			}
		}

		if (shouldEarlyReturn) break;
	}

	if (state.compilerOptions.removeComments !== true && statements.length > 0) {
		const lastStatement = statements[statements.length - 1];
		const lastToken = lastStatement.parent.getLastToken();
		if (lastToken && !ts.isNodeDescendantOf(lastToken, lastStatement)) {
			luau.list.pushList(result, state.getLeadingComments(lastToken));
		}
	}

	return result;
}
