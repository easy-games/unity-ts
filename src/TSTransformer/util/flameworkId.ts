import path from "path";
import { isNamedDeclaration } from "TSTransformer/classes/MacroManager";
import { TransformState } from "TSTransformer/classes/TransformState";
import { makePosixPath } from "TSTransformer/util/makePosixPath";
import { isDefinedType } from "TSTransformer/util/types";
import ts from "typescript";

function isReferenceType(node?: ts.Node): node is ts.TypeReferenceNode {
	return node !== undefined && ts.isTypeReferenceNode(node);
}

function isQueryType(node?: ts.Node): node is ts.TypeQueryNode {
	return node !== undefined && ts.isTypeQueryNode(node);
}

/**
 * Format the internal id to be shorter, remove `out` part of path, and use hashPrefix.
 */
function formatInternalid(state: TransformState, internalId: string) {
	const match = new RegExp(`^.*:(.*)@(.+)$`).exec(internalId);
	if (!match) return internalId;

	const [, path, name] = match;
	const revisedPath = path.replace(/^(.*?)[/\\]/, "");
	return `${revisedPath}@${name}`;
}

export function getDeclarationName(node: ts.NamedDeclaration): string {
	if (node.name === undefined || !ts.isIdentifier(node.name)) return "$p:error";

	let name = node.name.text;
	for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
		if (ts.isNamedDeclaration(parent)) {
			name = parent.name.getText() + "." + name;
		}
	}
	return name;
}

const AIRSHIP_PKG_PREFIX = "AirshipPackages/@";
export function getFlameworkInternalId(state: TransformState, node: ts.NamedDeclaration) {
	let filePath = state.flamework!.getSourceFile(node).fileName;
	filePath = makePosixPath(filePath);

	const fullName = getDeclarationName(node);
	const relativePath = makePosixPath(path.relative(state.program.getCurrentDirectory(), filePath));

	// Flamework symbols
	if (relativePath.startsWith(state.flamework!.flameworkRootDir)) {
		return {
			internalId: `$${fullName}`,
			isPackage: true,
		};
	}

	// Package symbols
	if (relativePath.startsWith(AIRSHIP_PKG_PREFIX)) {
		const [, scope, packageName] = relativePath.split("/");

		return {
			internalId: `${scope}/${packageName}:${relativePath
				.substring(AIRSHIP_PKG_PREFIX.length + scope.length + packageName.length + 1)
				.replace(/(\.d)?.ts$/, "")}@${fullName}`,
			isPackage: true,
		};
	}

	return {
		isPackage: false,
		internalId: `${state.airshipBuildState.editorInfo.id}:${relativePath.replace(/(\.d)?.ts$/, "")}@${fullName}`,
	};
}

export function getFlameworkDeclarationUid(state: TransformState, declaration: ts.Declaration) {
	const { isPackage, internalId } = getFlameworkInternalId(state, declaration);

	const id = state.airshipBuildState.getFlameworkIdentifier(internalId);
	if (id) return id;

	if (isPackage) {
		return internalId;
	}

	const newId = formatInternalid(state, internalId);
	state.airshipBuildState.addFlameworkIdentifier(internalId, newId);
	return newId;
}

export function getFlameworkSymbolUid(state: TransformState, symbol: ts.Symbol) {
	if (symbol.valueDeclaration) {
		return getFlameworkDeclarationUid(state, symbol.valueDeclaration);
	} else if (symbol.declarations?.[0]) {
		return getFlameworkDeclarationUid(state, symbol.declarations[0]);
	} else {
		return "";
	}
}

export function getFlameworkTypeUid(state: TransformState, type: ts.Type) {
	if (type.symbol) {
		return getFlameworkSymbolUid(state, type.symbol);
	} else if (isDefinedType(type)) {
		return `$p:defined`;
	} else if (type.flags & ts.TypeFlags.Intrinsic) {
		return `$p:${(type as ts.IntrinsicType).intrinsicName}`;
	} else if (type.flags & ts.TypeFlags.NumberLiteral) {
		return `$pn:${(type as ts.NumberLiteralType).value}`;
	} else if (type.flags & ts.TypeFlags.StringLiteral) {
		return `$ps:${(type as ts.StringLiteralType).value}`;
	}
}

export function getFlameworkNodeUid(state: TransformState, node: ts.Node): string | undefined {
	if (isNamedDeclaration(node)) {
		return getFlameworkDeclarationUid(state, node);
	}

	// resolve type aliases to the alias declaration
	if (isReferenceType(node)) {
		return getFlameworkNodeUid(state, node.typeName);
	} else if (isQueryType(node)) {
		return getFlameworkNodeUid(state, node.exprName);
	}

	const symbol = state.services.macroManager.getSymbolFromNode(node);
	if (symbol) {
		return getFlameworkSymbolUid(state, symbol);
	}

	const type = state.typeChecker.getTypeAtLocation(node);
	return getFlameworkTypeUid(state, type);
}
