import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import ts from "typescript";

const TYPES_NOTICE = "\nYou may need to update your @easy-games/compiler-types!";

export const AIRSHIP_SYMBOL_NAMES = {
	AirshipBehaviour: "AirshipBehaviour",
} as const;

/**
 * Manages the macros of the ts.
 */
export class AirshipSymbolManager {
	private symbols = new Map<string, ts.Symbol>();

	constructor(typeChecker: ts.TypeChecker) {
		for (const symbolName of Object.values(AIRSHIP_SYMBOL_NAMES)) {
			const symbol = typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.All, false);
			if (symbol) {
				this.symbols.set(symbolName, symbol);
			} else {
				throw new ProjectError(`MacroManager could not find symbol for ${symbolName}` + TYPES_NOTICE);
			}
		}
	}

	public getSymbolOrThrow(name: string) {
		const symbol = this.symbols.get(name);
		assert(symbol);
		return symbol;
	}

	public getAirshipBehaviourSymbolOrThrow() {
		return this.getSymbolOrThrow(AIRSHIP_SYMBOL_NAMES.AirshipBehaviour);
	}
}
