import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getDestructorForBindingType } from "TSTransformer/util/binding/getDestructorForBindingType";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformArrayBindingPattern(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);

	let index = 0;
	const idStack = new Array<luau.AnyIdentifier>();

	const accessor = getAccessorForBindingType(state, bindingPattern, state.getType(bindingPattern));
	const destructor = getDestructorForBindingType(state, bindingPattern, state.getType(bindingPattern));

	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, index, idStack, true);
		} else {
			const name = element.name;
			const value = element.dotDotDotToken
				? destructor(state, parentId, index, idStack)
				: accessor(state, parentId, index, idStack, false);

			if (ts.isIdentifier(name)) {
				const id = transformVariable(state, name, value);
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
			} else {
				const id = state.pushToVar(value, "binding");
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, name, id);
				} else {
					transformObjectBindingPattern(state, name, id);
				}
			}
		}
		index++;
	}
}
