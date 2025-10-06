import { warnings } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { getAncestorTypeSymbols, getExtendsClasses, getTypesOfClasses } from "TSTransformer/util/airshipBehaviourUtils";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function isRootAirshipBehaviourClassNoState(
	singletonSymbol: ts.Symbol,
	typeChecker: ts.TypeChecker,
	node: ts.ClassLikeDeclaration,
) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const symbol = getOriginalSymbolOfNode(typeChecker, extendsNode.expression);
		if (symbol === singletonSymbol) {
			return true;
		}
	}

	return false;
}

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

export function isRootAirshipSingletonClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const airshipSingletonSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

		return isRootAirshipBehaviourClassNoState(airshipSingletonSymbol, state.typeChecker, node);
		// const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		// if (symbol === airshipSingletonSymbol) {
		// 	return true;
		// }
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

		const extendsClasses = getTypesOfClasses(state.typeChecker, getExtendsClasses(state.typeChecker, node));
		if (extendsClasses.length === 0) return false;

		const baseClass = extendsClasses[extendsClasses.length - 1];
		return baseClass.symbol === airshipBehaviourSymbol;
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
		const inheritance = getAncestorTypeSymbols(type, typeChecker);
		if (inheritance.length === 0) {
			return false;
		}

		// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
		const baseTypeDeclaration = inheritance[inheritance.length - 2] ?? inheritance[inheritance.length - 1];
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

		const extendsClasses = getTypesOfClasses(state.typeChecker, getExtendsClasses(state.typeChecker, node));
		if (extendsClasses.length === 0) return false;

		const baseClass = extendsClasses[extendsClasses.length - 2] ?? extendsClasses[extendsClasses.length - 1];
		return baseClass.symbol === airshipBehaviourSymbol;
	}

	return false;
}

export function isAirshipBehaviourMethod(state: TransformState, node: ts.MethodDeclaration) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (!symbol) return false;

	if (!ts.isIdentifier(node.name)) {
		return false;
	}

	const behaviourMethods = state.services.airshipSymbolManager.behaviourMethods;
	return behaviourMethods.get(node.name.text) !== undefined;
}

export function isAirshipBehaviourProperty(state: TransformState, node: ts.PropertyDeclaration) {
	const nodeType = state.getType(node);
	if (isAirshipBehaviourType(state, nodeType)) {
		return true;
	}

	const symbol = nodeType.symbol;
	if (symbol?.valueDeclaration && ts.isClassLike(symbol.valueDeclaration)) {
		const isBehaviourClass = isAirshipBehaviourClass(state, symbol.valueDeclaration);
		if (isBehaviourClass) {
			// Disallow generic properties
			const nodeTypeRef = node.type;
			if (nodeTypeRef && ts.isTypeReferenceNode(nodeTypeRef) && nodeTypeRef.typeArguments) {
				DiagnosticService.addDiagnostic(warnings.genericBehaviourReference(node));
				return false;
			}
		}

		return isBehaviourClass;
	}

	return false;
}

export function isAirshipBehaviourType(state: TransformState, type: ts.Type, includeBaseType = false) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();

	if (includeBaseType && airshipBehaviourSymbol === type.symbol) return true;

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type, state.typeChecker);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 1];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}

	return false;
}

export const enum SingletonQueryType {
	IsRootSingleton,
	IsAnySingleton,
}

export function isClassInheritingSymbol(state: TransformState, node: ts.ClassLikeDeclaration, symbol: ts.Symbol) {
	const type = state.typeChecker.getTypeAtLocation(node);

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type, state.typeChecker);
	if (inheritance.length === 0) {
		return false;
	}

	return inheritance.some(value => value === symbol);
}

export function isAirshipSingletonType(state: TransformState, type: ts.Type) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type, state.typeChecker);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 2];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}

	return false;
}

export function isAirshipSingletonSymbol(state: TransformState, symbol: ts.Symbol) {
	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();
	const type = state.typeChecker.getTypeOfSymbol(symbol);

	// Get the inheritance tree, otherwise
	const inheritance = getAncestorTypeSymbols(type, state.typeChecker);
	if (inheritance.length === 0) {
		return false;
	}

	// Get the root inheriting symbol (Should match AirshipBehaviour for this to be "extending" AirshipBehaviour)
	const baseTypeDeclaration = inheritance[inheritance.length - 2];
	if (baseTypeDeclaration !== undefined) {
		return baseTypeDeclaration === airshipBehaviourSymbol;
	}

	return false;
}

export function isAirshipBehaviourTypeNode(state: TransformState, typeNode: ts.TypeNode) {
	// We'll try the quick symbol way
	const type = state.getType(typeNode);
	if (isAirshipBehaviourType(state, type, true)) return true; // quick and dirty

	// If not, we'll use the slower value declaration walking method
	const symbolOfTypeArg = state.typeChecker.getTypeAtLocation(typeNode).symbol;
	const valueDeclaration = symbolOfTypeArg.valueDeclaration;
	if (!valueDeclaration || !ts.isClassDeclaration(valueDeclaration)) return false;
	return isAirshipBehaviourClass(state, valueDeclaration);
}
