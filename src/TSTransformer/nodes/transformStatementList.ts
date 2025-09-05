import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import {
	isClientIfDirective,
	isGuardClause,
	isInverseGuardClause,
	isServerIfDirective,
	transformDirectiveIfStatement,
} from "TSTransformer/macros/transformDirectives";
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
			if (isGuardClause(state, statement)) {
				if (isServerIfDirective(state, statement)) {
					const newStatement = transformDirectiveIfStatement(state, statement);
					if (state.isServerContext && newStatement) {
						statement = newStatement;
						shouldEarlyReturn = true;
					} else if (statement.elseStatement) {
						statement = statement.elseStatement;
					} else if (newStatement === false) {
						continue;
					}
				} else if (isClientIfDirective(state, statement)) {
					const newStatement = transformDirectiveIfStatement(state, statement);
					if (state.isClientContext && newStatement) {
						shouldEarlyReturn = true;
						statement = newStatement;
					} else if (statement.elseStatement) {
						statement = statement.elseStatement;
					} else if (newStatement === false) {
						continue;
					}
				} else {
					continue;
				}
			} else if (isInverseGuardClause(state, statement)) {
				if (state.isClientContext && isServerIfDirective(state, statement)) {
					shouldEarlyReturn = true;
					const newStatement = transformDirectiveIfStatement(state, statement);
					if (newStatement) {
						statement = newStatement;
					} else if (newStatement === false) {
						continue;
					}
				} else if (state.isServerContext && isClientIfDirective(state, statement)) {
					shouldEarlyReturn = true;
					const newStatement = transformDirectiveIfStatement(state, statement);
					if (newStatement) {
						statement = newStatement;
					} else if (newStatement === false) {
						continue;
					}
				} else {
					continue;
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
