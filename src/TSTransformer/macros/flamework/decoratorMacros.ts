import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { CallDecoratorMacro, MacroList } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { getFlameworkSymbolUid } from "TSTransformer/util/flameworkId";
import ts from "typescript";

function createFlameworkDecoratorMacro(flameworkDecorator: "Service" | "Controller" | "Singleton"): CallDecoratorMacro {
	return (state, decorator, node) => {
		return undefined;
	};
}

export const FLAMEWORK_DECORATOR_MACROS = {
	Service: createFlameworkDecoratorMacro("Service"),
	Controller: createFlameworkDecoratorMacro("Controller"),
	Singleton: createFlameworkDecoratorMacro("Singleton"),
} satisfies MacroList<CallDecoratorMacro>;
