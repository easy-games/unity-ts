import luau from "@roblox-ts/luau-ast";
import { errors, warnings } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { getFlameworkSymbolUid } from "TSTransformer/util/flameworkId";
import ts from "typescript";

export const FLAMEWORK_CALL_MACROS = {
	Dependency: (state, node) => {
		const firstArg = node.arguments[0];
		const firstType = node.typeArguments?.[0];

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
			return luau.call(state.flamework!.Flamework("resolveDependency"), [
				luau.string(getFlameworkSymbolUid(state, symbol)),
			]);
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

			return luau.call(state.flamework!.Flamework("resolveDependency"), [
				luau.string(getFlameworkSymbolUid(state, symbol)),
			]);
		}

		DiagnosticService.addDiagnostic(errors.dependencyInjectionNoType(node));
		return luau.nil();
	},
} satisfies MacroList<CallMacro>;
