import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { PropertyCallMacro } from "TSTransformer/macros/types";
import { transformCallExpression } from "TSTransformer/nodes/expressions/transformCallExpression";
import { isUnityObjectType } from "TSTransformer/util/airshipBehaviourUtils";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isAirshipBehaviourType } from "TSTransformer/util/extendsAirshipBehaviour";
import { isMethod } from "TSTransformer/util/isMethod";
import ts from "typescript";

export interface MethodGenericInfo {
	parameters: Array<luau.AnyIdentifier>;
}

export interface GenericParameter {
	symbol: ts.Symbol;
	method: ts.MethodDeclaration;
	id: luau.AnyIdentifier;
	initializer: ts.Expression | undefined;
}

function getGenericArgument(typeArgument: ts.TypeNode) {
	if (ts.isTypeReferenceNode(typeArgument)) {
		return luau.string(typeArgument.typeName.getText());
	}
}

export function createGenericMacroMethod(genericParameters: ReadonlyArray<GenericParameter>): PropertyCallMacro {
	return (state, node, expression, args) => {
		if (isMethod(state, node.expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
			const declaration = symbol?.valueDeclaration;
			if (declaration && ts.isMethodDeclaration(declaration) && declaration.typeParameters) {
				const parameters = new Array<luau.Expression>();

				for (let i = 0; i < declaration.typeParameters.length; i++) {
					const symbolOfParameter = state.typeChecker.getSymbolAtLocation(declaration.typeParameters[i].name);
					if (!symbolOfParameter) continue;
					const matchingItem = genericParameters.find(f => f.symbol === symbolOfParameter);
					if (!matchingItem) continue;

					const typeArgument = node.typeArguments?.[i];
					if (typeArgument !== undefined) {
						const genericArg = getGenericArgument(typeArgument);
						if (genericArg) parameters.push(genericArg);
					} else {
						const defaultArg = declaration.typeParameters[i].default;
						if (defaultArg === undefined) {
							DiagnosticService.addDiagnostic(errors.argument(declaration.typeParameters[i]));
							return luau.nil();
						}

						const genericArg = getGenericArgument(defaultArg);
						if (genericArg) parameters.push(genericArg);
						else parameters.push(luau.nil());
					}
				}

				if (ts.isPropertyAccessExpression(node.expression)) {
					return luau.create(luau.SyntaxKind.MethodCallExpression, {
						name: node.expression.name.text,
						expression: convertToIndexableExpression(expression),
						args: luau.list.make(...parameters, ...args),
					});
				}
			}
		}

		return transformCallExpression(state, node);
	};
}

export function getForwardedGenericsForMethod(
	state: TransformState,
	node: ts.MethodDeclaration,
): MethodGenericInfo | undefined {
	let shouldForward = false;

	const docs = ts.getJSDocTags(node);
	for (const doc of docs) {
		if (doc.tagName.text === "macro" && node.typeParameters) {
			shouldForward = true;
		}
	}

	if (shouldForward) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		if (!symbol) return;

		const idList = new Array<GenericParameter>();
		if (!node.typeParameters) return undefined;

		for (const argument of node.typeParameters) {
			const constraint = argument.constraint;
			if (!constraint) continue;

			const constraintType = state.typeChecker.getTypeAtLocation(constraint);
			if (!constraintType) continue;
			if (!isAirshipBehaviourType(state, constraintType, true) && !isUnityObjectType(state, constraintType)) {
				continue;
			}

			const idSymbol = state.typeChecker.getSymbolAtLocation(argument.name)!;
			idList.push({
				id: luau.tempId(argument.name.text),
				method: node,
				symbol: idSymbol,
				initializer: undefined,
			});
		}

		state.services.macroManager.registerMacroFunction(symbol, idList);
		return {
			parameters: idList.map(v => v.id),
		};
	}
}
