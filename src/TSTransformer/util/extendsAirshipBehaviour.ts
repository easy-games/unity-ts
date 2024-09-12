import { AirshipSpecialClassName, TransformState } from "TSTransformer";
import { getAncestorTypeSymbols } from "TSTransformer/util/airshipBehaviourUtils";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function isRootAirshipBehaviourClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}
	}

	return false;
}

export function isAnyRootAirshipClass(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	// symbolName: AirshipClassSymbolNames,
) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipRootClassSymbols = state.services.airshipSymbolManager.getAirshipSymbols([
			"AirshipBehaviour",
			"AirshipSingleton",
			"AirshipScriptableRenderPass",
		]);

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		for (const otherSymbol of airshipRootClassSymbols) {
			if (otherSymbol === symbol) {
				return true;
			}
		}
	}

	return false;
}

export function isRootAirshipSingletonClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipSingletonSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipSingletonSymbol) {
			return true;
		}
	}

	return false;
}

export function isAirshipClass(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	symbolName: AirshipSpecialClassName,
) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSymbolOrThrow(symbolName);

		// check if the immediate extends is AirshipBehaviour
		let type = state.typeChecker.getTypeAtLocation(node);
		if (type.isNullableType()) {
			type = type.getNonNullableType();
		}

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}

		// Get the inheritance tree, otherwise
		const inheritance = getAncestorTypeSymbols(type);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 1];
		if (baseTypeDeclaration !== undefined) {
			return baseTypeDeclaration === airshipBehaviourSymbol;
		}
	}

	return false;
}

export function isAirshipBehaviourClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

		// check if the immediate extends is AirshipBehaviour
		let type = state.typeChecker.getTypeAtLocation(node);
		if (type.isNullableType()) {
			type = type.getNonNullableType();
		}

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}

		// Get the inheritance tree, otherwise
		const inheritance = getAncestorTypeSymbols(type);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 1];
		if (baseTypeDeclaration !== undefined) {
			return baseTypeDeclaration === airshipBehaviourSymbol;
		}
	}

	return false;
}

export function isAirshipSingletonClassNoState(
	airshipBehaviourSymbol: ts.Symbol,
	typeChecker: ts.TypeChecker,
	node: ts.ClassLikeDeclaration,
) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		// check if the immediate extends is AirshipBehaviour
		let type = typeChecker.getTypeAtLocation(node);
		if (type.isNullableType()) {
			type = type.getNonNullableType();
		}

		const symbol = getOriginalSymbolOfNode(typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}

		// Get the inheritance tree, otherwise
		const inheritance = getAncestorTypeSymbols(type);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 1];
		if (baseTypeDeclaration !== undefined) {
			return baseTypeDeclaration === airshipBehaviourSymbol;
		}
	}

	return false;
}

export function isAirshipSingletonClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

		// check if the immediate extends is AirshipBehaviour
		let type = state.typeChecker.getTypeAtLocation(node);
		if (type.isNullableType()) {
			type = type.getNonNullableType();
		}

		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol === airshipBehaviourSymbol) {
			return true;
		}

		// Get the inheritance tree, otherwise
		const inheritance = getAncestorTypeSymbols(type);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 1];
		if (baseTypeDeclaration !== undefined) {
			return baseTypeDeclaration === airshipBehaviourSymbol;
		}
	}

	return false;
}

export function isAirshipBehaviourType(state: TransformState, type: ts.Type) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 1];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}
}

export function isAirshipSingletonType(state: TransformState, type: ts.Type) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 1];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}
}

export function isAirshipSingletonSymbol(state: TransformState, symbol: ts.Symbol) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();
	const type = state.typeChecker.getTypeOfSymbol(symbol);

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 1];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}
}
