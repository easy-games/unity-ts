import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { CompliationContext, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { getForwardedGenericsForMethod } from "TSTransformer/macros/generics/createGenericMacroMethod";
import {
	createStripReturn,
	getStrippableMethodType,
	isStrippableContextMethod,
} from "TSTransformer/macros/transformContextMethods";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isMethod } from "TSTransformer/util/isMethod";
import { assignToMapPointer, Pointer } from "TSTransformer/util/pointer";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";
import ts from "typescript";

export function transformMethodDeclaration(
	state: TransformState,
	node: ts.MethodDeclaration,
	ptr: Pointer<luau.Map | luau.AnyIdentifier>,
) {
	const result = luau.list.make<luau.Statement>();

	if (!node.body) {
		return luau.list.make<luau.Statement>();
	}

	assert(node.name);
	if (ts.isPrivateIdentifier(node.name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node.name));
		return luau.list.make<luau.Statement>();
	}

	const prefixParameters = luau.list.make();
	const macro = getForwardedGenericsForMethod(state, node);
	if (macro) {
		for (const id of macro.parameters) {
			luau.list.push(prefixParameters, id);
		}
	}

	// eslint-disable-next-line no-autofix/prefer-const
	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	luau.list.pushList(statements, transformStatementList(state, node.body.statements));

	let name = transformPropertyName(state, node.name);
	if (ts.hasDecorators(node) && !luau.isSimple(name)) {
		const tempId = luau.tempId("key");
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: tempId,
				right: name,
			}),
		);
		name = tempId;
		state.setClassElementObjectKey(node, tempId);
	}

	const isAsync = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Async);
	const isStrippable = isStrippableContextMethod(state, node);

	if (isStrippable) {
		const contextType = getStrippableMethodType(state, node);
		if (contextType !== undefined) {
			luau.list.unshiftList(
				statements,
				createStripReturn(state, luau.isStringLiteral(name) ? name.value : "", node, contextType),
			);
		}
	}

	if (node.asteriskToken) {
		if (isAsync) {
			DiagnosticService.addDiagnostic(errors.noAsyncGeneratorFunctions(node));
		}
		statements = wrapStatementsAsGenerator(state, node, statements);
	}

	// can we use `function class:name() end`?
	if (!isAsync && luau.isStringLiteral(name) && !luau.isMap(ptr.value) && luau.isValidIdentifier(name.value)) {
		if (isMethod(state, node)) {
			luau.list.shift(parameters); // remove `self`
			luau.list.unshiftList(parameters, prefixParameters);

			luau.list.push(
				result,
				luau.create(luau.SyntaxKind.MethodDeclaration, {
					expression: ptr.value,
					name: name.value,
					statements,
					parameters,
					hasDotDotDot,
				}),
			);
		} else {
			luau.list.push(
				result,
				luau.create(luau.SyntaxKind.FunctionDeclaration, {
					name: luau.property(ptr.value, name.value),
					localize: false,
					statements,
					parameters,
					hasDotDotDot,
				}),
			);
		}
		return result;
	}

	let expression: luau.Expression = luau.create(luau.SyntaxKind.FunctionExpression, {
		statements,
		parameters,
		hasDotDotDot,
	});

	if (isAsync) {
		expression = luau.call(state.TS(node, "async"), [expression]);
	}

	// we have to use `class[name] = function()`
	luau.list.pushList(
		result,
		state.capturePrereqs(() => assignToMapPointer(state, ptr, name, expression)),
	);

	return result;
}
