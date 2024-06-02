import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, MacroList } from "TSTransformer/macros/types";

export const FLAMEWORK_CALL_MACROS = {
	Dependency: (state, node) => {
		return luau.call(state.flamework!.Flamework("resolveDependency"), [luau.string("__ID__TODO__")]);
	},
} satisfies MacroList<CallMacro>;
