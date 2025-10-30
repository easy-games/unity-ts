import luau from "@roblox-ts/luau-ast";
import { errors, warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getFlameworkNodeUid, getFlameworkSymbolUid } from "TSTransformer/util/flameworkId";
import ts from "typescript";

export const FLAMEWORK_PROPERTY_CALL_MACROS = {
	id: (state, node: ts.CallExpression): luau.Expression => {
		const firstType = node.typeArguments?.[0];
		if (firstType !== undefined) {
			return luau.string(getFlameworkNodeUid(state, firstType) || "$p:error");
		}

		DiagnosticService.addDiagnostic(errors.flameworkIdNoType(node));
		return luau.nil();
	},
	hash: () => {
		// TODO: Probably remove this, there's no real reason to have this
		return luau.nil();
	},
	implements: (state, node: ts.CallExpression): luau.Expression => {
		const flameworkImportId = state.getOrAddFileImport(state.flamework!.flameworkRootDir + "/index", "Flamework");
		const Flamework_implements = luau.property(flameworkImportId, "_implements");

		const firstArg = node.arguments[0];
		const firstType = node.typeArguments?.[0];
		if (firstType !== undefined) {
			if (ts.isPropertyAccessExpression(node.expression)) {
				return luau.call(Flamework_implements, [
					transformExpression(state, firstArg),
					luau.string(getFlameworkNodeUid(state, firstType) || "$p:error"),
				]);
			}
		}

		DiagnosticService.addDiagnostic(errors.flameworkIdNoType(node));
		return luau.nil();
	},
} satisfies MacroList<PropertyCallMacro>;

interface GenericInfo {
	index: number;
}
function moddingGenericMacro(name: string, genericInfo: GenericInfo): CallMacro {
	return (state, node, expression, args) => {
		const typeArgument = node.typeArguments?.[0];
		if (typeArgument === undefined) {
			return luau.nil();
		}

		for (let i = 0; i < genericInfo.index; i++) {
			const arg = args[i];
			if (arg !== undefined) continue;

			args.push(luau.nil());
		}

		const argument = node.arguments[genericInfo.index];
		if (argument === undefined) {
			args.push(luau.string(getFlameworkNodeUid(state, typeArgument) || "$p:error"));
		}

		return luau.call(luau.property(expression as luau.IndexableExpression, name), args);
	};
}

export const FLAMEWORK_MODDING_PROPERTY_CALL_MACROS = {
	getDecorator: moddingGenericMacro("getDecorator", { index: 2 }),
	getDecorators: moddingGenericMacro("getDecorators", { index: 0 }),
	getPropertyDecorators: moddingGenericMacro("getPropertyDecorators", { index: 1 }),
	registerDependency: moddingGenericMacro("registerDependency", { index: 1 }),
} satisfies MacroList<PropertyCallMacro>;

export const FLAMEWORK_CALL_MACROS = {
	Dependency: (state, node: ts.CallExpression): luau.Expression => {
		const flameworkImportId = state.getOrAddFileImport(state.flamework!.flameworkRootDir + "/index", "Flamework");
		const Flamework_resolveDependency = luau.property(flameworkImportId, "resolveDependency");

		const firstArg = node.arguments[0];
		const firstType = node.typeArguments?.[0];

		if (node.parent.parent && ts.isSourceFile(node.parent.parent)) {
			DiagnosticService.addDiagnostic(warnings.flameworkDependencyRaceCondition(node));
		}

		if (firstArg && !firstType) {
			// TODO: Remove this usage in types + here soon
			if (!ts.isIdentifier(firstArg)) {
				DiagnosticService.addDiagnostic(errors.dependencyInjectionNoConstructor(node));
				return luau.nil();
			}

			const symbol = state.services.macroManager.getSymbolFromNode(firstArg);
			if (!symbol) {
				DiagnosticService.addDiagnostic(errors.dependencyInjectionNoConstructor(node));
				return luau.nil();
			}

			DiagnosticService.addDiagnostic(warnings.dependencyInjectionDeprecated(node, firstArg));
			return luau.call(Flamework_resolveDependency, [luau.string(getFlameworkSymbolUid(state, symbol))]);
		} else if (firstType && !firstArg) {
			if (!ts.isTypeReferenceNode(firstType)) {
				DiagnosticService.addDiagnostic(errors.expectedTypeReference(node, firstType));
				return luau.nil();
			}

			const symbol = state.services.macroManager.getSymbolFromNode(firstType.typeName);
			if (!symbol) {
				DiagnosticService.addDiagnostic(errors.expectedTypeReference(node, firstType));
				return luau.nil();
			}

			return luau.call(Flamework_resolveDependency, [luau.string(getFlameworkSymbolUid(state, symbol))]);
		}

		DiagnosticService.addDiagnostic(errors.dependencyInjectionNoType(node));
		return luau.nil();
	},
} satisfies MacroList<CallMacro>;
