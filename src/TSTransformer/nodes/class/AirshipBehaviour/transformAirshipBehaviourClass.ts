import crypto from "crypto";
import mark, { Node as MarkdownNode } from "markdown-ast";
import path from "path";
import { errors } from "Shared/diagnostics";
import {
	AirshipBehaviour,
	AirshipBehaviourClassDecorator,
	AirshipBehaviourFieldDecorator,
	AirshipBehaviourFieldDecoratorParameter,
	AirshipBehaviourFieldExport,
	AirshipBehaviourJson,
	AirshipDocTag,
	AirshipFieldDocs,
	AirshipSerializable,
} from "Shared/types";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import {
	writeEnumInfo,
	writeLiteralUnionInfo,
} from "TSTransformer/nodes/class/AirshipBehaviour/transformAirshipPropertyEnums";
import {
	getAncestorTypeSymbols,
	getEnumMetadata,
	getEnumValue,
	getUnityObjectInitializerDefaultValue,
	isEnumType,
	isLiteralUnionType,
	isPublicWritablePropertyDeclaration,
	isSerializableType,
	isUnityObjectType,
	isValidAirshipBehaviourExportType,
} from "TSTransformer/util/airshipBehaviourUtils";
import {
	isAirshipBehaviourProperty,
	isAirshipBehaviourType,
	isAirshipScriptableObjectProperty,
	isAirshipScriptableObjectType,
	isAirshipSingletonClass,
} from "TSTransformer/util/extendsAirshipBehaviour";
import { getMetadataValueFromNode } from "TSTransformer/util/getMetadataValueFromNode";
import ts, { JSDoc, JSDocComment, JSDocTag, ModifierFlags } from "typescript";

function formatAsUnityString(nodes: Array<MarkdownNode>): string {
	const str = new Array<string>();

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];

		switch (node.type) {
			case "text":
			case "break":
				str.push(node.text);
				break;
			case "list": {
				const innerContent = new Array<string>();
				innerContent.push("• ");
				for (const listItem of node.block) {
					innerContent.push(formatAsUnityString([listItem]));
				}
				str.push(innerContent.join("") + (nodes[i + 1]?.type === "list" ? "\n" : ""));
				break;
			}
			case "bold": {
				const innerContent = new Array<string>();
				innerContent.push("<b>");

				for (const item of node.block) {
					innerContent.push(formatAsUnityString([item]));
				}

				innerContent.push("</b>");
				str.push(innerContent.join(""));
				break;
			}
			case "italic": {
				const innerContent = new Array<string>();
				innerContent.push("<i>");

				for (const item of node.block) {
					innerContent.push(formatAsUnityString([item]));
				}

				innerContent.push("</i>");
				str.push(innerContent.join(""));
				break;
			}
			case "quote": {
				const innerContent = new Array<string>();

				for (const item of node.block) {
					innerContent.push("» " + formatAsUnityString([item]));
				}
				str.push(innerContent.join("\n"));
				break;
			}
			case "title": {
				const sizes = [undefined, 25, 23, 20, 18, 16, 14] as const;
				const size = sizes[node.rank];

				const innerContent = new Array<string>();
				innerContent.push("<b><size=" + size + ">");

				for (const item of node.block) {
					innerContent.push(formatAsUnityString([item]));
				}

				innerContent.push("</size></b>");
				str.push(innerContent.join(""));

				break;
			}
			case "codeSpan": {
				str.push(node.code);
				break;
			}
			case "link": {
				const innerContent = new Array<string>();
				innerContent.push(`<a href='${node.url}'>`);

				for (const item of node.block) {
					innerContent.push(formatAsUnityString([item]));
				}

				innerContent.push("</a>");
				str.push(innerContent.join(""));
				break;
			}
		}
	}

	return str.join("").trim();
}

function toUnityString(value: string): string {
	const markdown = mark(value);
	const result = formatAsUnityString(markdown);
	return result;
}

// eslint-disable-next-line require-yield
function* getAirshipDocComments(
	state: TransformState,
	docs: ReadonlyArray<JSDocTag | JSDoc | JSDocComment>,
): Generator<string, void, void> {
	for (const doc of docs) {
		if (ts.isJSDoc(doc)) {
			if (typeof doc.comment === "string" && doc.comment !== "") {
				yield toUnityString(doc.comment);
			} else if (doc.comment) {
				// Get as sub comments
				yield* getAirshipDocComments(state, doc.comment);
			}
		} else if (ts.isJSDocTag(doc)) {
			continue; // Ignore tags
		} else if (ts.isJSDocLink(doc)) {
			if (doc.name && ts.isIdentifier(doc.name)) {
				const symbol = state.typeChecker.getSymbolAtLocation(doc.name)!;
				if (symbol) {
					const declarations = symbol.declarations;

					if (declarations !== undefined) {
						const [declaration] = declarations;

						// if (ts.isImportClause(declaration)) {
						// 	const parent = declaration.parent;
						// 	if (ts.isImportDeclaration(parent)) {
						// 		const modSpec = parent.moduleSpecifier;
						// 		if (ts.isStringLiteral(modSpec)) {
						// 			const sourceFile = state.program.getSourceFile(modSpec.text);
						// 			const symbol = state.typeChecker.getSymbolAtLocation(modSpec);
						// 			console.log("import sym bis", symbol)

						// 			if (!sourceFile) {
						// 				console.warn("no source file", modSpec.text); //
						// 				continue;
						// 			}

						// 			const pos = sourceFile.getLineAndCharacterOfPosition(declaration.getStart()!);
						// 			yield `<a href='#' kind='${ts.SyntaxKind[declaration.kind]}' file='${
						// 				sourceFile.fileName
						// 			}' line='${pos.line + 1}'>${doc.text || doc.name.text}</a>`;
						// 		} else {
						// 			console.warn("is not string literal");
						// 		}
						// 	} else {
						// 		console.warn("is not import decl");
						// 	}
						// } else {
						const sourceFile = declaration.getSourceFile();
						const pos = sourceFile.getLineAndCharacterOfPosition(declaration.getStart()!);
						yield `<a href='#' file='${sourceFile.fileName}' line='${pos.line + 1}'>${
							doc.text || doc.name.text
						}</a>`;
						// }
					}
				}
			}
		} else {
			if (doc.text !== "") yield toUnityString(doc.text);
		}
	}
}

function* getAirshipDocTags(
	state: TransformState,
	docs: ReadonlyArray<JSDocTag | JSDoc | JSDocComment>,
): Generator<AirshipDocTag, void, void> {
	for (const doc of docs) {
		if (ts.isJSDocTag(doc)) {
			if (typeof doc.comment === "string") {
				yield {
					name: doc.tagName.text,
					text: doc.comment,
				} as AirshipDocTag;
			} else if (doc.comment) {
				yield* getAirshipDocTags(state, doc.comment);
			} else {
				yield { name: doc.tagName.text, text: undefined };
			}
		} else if (ts.isJSDoc(doc)) {
			if (doc.tags) yield* getAirshipDocTags(state, doc.tags);
		}
	}
}

function createAirshipDocs(state: TransformState, docs: ReadonlyArray<JSDocTag | JSDoc>): AirshipFieldDocs | undefined {
	const fielddocs = {} as AirshipFieldDocs;

	for (const comment of getAirshipDocComments(state, docs)) {
		if (comment !== "") (fielddocs.text ??= []).push(comment);
	}

	for (const tag of getAirshipDocTags(state, docs)) {
		if (tag.name === "notooltip") return undefined;
		(fielddocs.tags ??= []).push(tag);
	}

	return fielddocs;
}

/** Make all properties in T non-readonly. */
type Writable<T> = { -readonly [P in keyof T]: T[P] };

function createAirshipProperty(
	state: TransformState,
	name: string,
	type: ts.Type,
	node: ts.PropertyDeclaration,
	decorators: Array<AirshipBehaviourFieldDecorator>,
): Writable<AirshipBehaviourFieldExport> {
	const typeChecker = state.typeChecker;
	const isArray = typeChecker.isArrayType(type);
	const isObject = isUnityObjectType(state, type);
	const isEnum = isEnumType(type);
	const typeString = typeChecker.typeToString(type.getNonNullableType());

	const prop = {
		name,
	} as Writable<AirshipBehaviourFieldExport>;

	const docs = ts.getJSDocCommentsAndTags(node);
	if (docs.length > 0 && !state.data.isPublishing && !decorators.find(f => f.name === "Tooltip")) {
		prop.jsdoc = createAirshipDocs(state, docs);
	}

	if (isObject) {
		const nonNullableTypeString = typeChecker.typeToString(type.getNonNullableType());

		prop.objectType = nonNullableTypeString;
		if (type.isNullableType()) prop.nullable = true;
		prop.type = isArray ? "Array" : "object";
	} else if (isArray) {
		const arrayItemType = typeChecker.getElementTypeOfArrayType(type)!;
		const typeString = typeChecker.typeToString(arrayItemType);
		const isObject = isUnityObjectType(state, arrayItemType);

		prop.type = "Array";

		if (type.isNullableType()) prop.nullable = true;

		if (isEnumType(arrayItemType)) {
			const symbol = arrayItemType.symbol;
			const declaration = symbol?.declarations?.[0];
			const sourceFile = declaration?.getSourceFile();

			const docTags = declaration ? ts.getJSDocTags(declaration) : [];

			const enumInfo = getEnumMetadata(
				arrayItemType,
				docTags.find(f => f.tagName.text === "flags") !== undefined,
			);
			if (enumInfo && sourceFile) {
				const { enumTypeString, enumRef } = writeEnumInfo(state, arrayItemType, sourceFile, enumInfo);

				prop.items = {
					type: enumTypeString,
					objectType: undefined,
				};

				prop.ref = enumRef;
			}
		} else if (isAirshipBehaviourType(state, arrayItemType)) {
			const fileRef = state.getOutputPathFromType(arrayItemType);

			prop.items = {
				type: "AirshipBehaviour",
				objectType: typeString,
			};

			prop.fileRef = fileRef;
		} else if (isAirshipScriptableObjectType(state, arrayItemType)) {
			const fileRef = state.getOutputPathFromType(arrayItemType);

			prop.items = {
				type: "AirshipScriptableObject",
				objectType: typeString,
			};

			prop.fileRef = fileRef;
		} else {
			prop.items = {
				type: isObject ? "object" : typeString,
				objectType: isObject ? typeString : undefined,
			};
		}
	} else if (isAirshipScriptableObjectProperty(state, node)) {
		prop.type = "AirshipScriptableObject";
		type = typeChecker.getNonNullableType(type);

		prop.objectType = typeChecker.typeToString(type);
		prop.fileRef = state.getOutputPathFromType(type);
		if (type.isNullableType()) prop.nullable = true;
	} else if (isAirshipBehaviourProperty(state, node)) {
		prop.type = "AirshipBehaviour";

		type = typeChecker.getNonNullableType(type);

		prop.objectType = typeChecker.typeToString(type);
		prop.fileRef = state.getOutputPathFromType(type);

		if (type.isNullableType()) prop.nullable = true;
	} else if (isLiteralUnionType(type)) {
		if (type.isNullableType()) prop.nullable = true;

		const results = writeLiteralUnionInfo(state, type);
		if (results) {
			prop.type = results.enumTypeString;
			prop.ref = results.enumRef;
		}
	} else if (isEnum) {
		if (type.isNullableType()) prop.nullable = true;
		prop.type = "enum";

		const symbol = node.initializer ? typeChecker.getSymbolAtLocation(node.initializer) : type.symbol;
		const declaration = symbol?.declarations?.[0];
		const sourceFile = declaration?.getSourceFile();

		const docTags = declaration ? ts.getJSDocTags(declaration) : [];

		const enumInfo = getEnumMetadata(type, docTags.find(f => f.tagName.text === "flags") !== undefined);

		if (sourceFile && enumInfo) {
			const { enumTypeString, enumRef } = writeEnumInfo(state, type, sourceFile, enumInfo);
			prop.type = enumTypeString;
			prop.ref = enumRef;

			if (node.initializer && ts.isPropertyAccessExpression(node.initializer)) {
				const enumKey = getEnumValue(state, node.initializer);
				prop.default = enumKey;
			}
		}
	} else if (isSerializableType(state, type)) {
		if (type.isNullableType()) prop.nullable = true;
		prop.type = "AirshipSerializableObject";
		prop.fileRef = state.getOutputPathFromType(type);
		prop.objectType = typeChecker.typeToString(type);
		if (type.isNullableType()) prop.nullable = true;
	} else {
		prop.type = typeString;
	}

	if (type.isNullableType()) prop.nullable = true;

	if (node.initializer) {
		if (ts.isArrayLiteralExpression(node.initializer)) {
			prop.default = node.initializer.elements.map(element =>
				getUnityObjectInitializerDefaultValue(state, element),
			);
		} else {
			const initializer = node.initializer;
			if (initializer) {
				const objectInitializer = getUnityObjectInitializerDefaultValue(state, initializer);
				if (objectInitializer !== undefined) prop.default = objectInitializer;
			}
		}
	}

	if (decorators.length > 0 && !state.data.isPublishing) prop.decorators = decorators;
	return prop;
}

function processRequireComponentDecorator(
	state: TransformState,
	classNode: ts.ClassLikeDeclaration,
	expression: ts.CallExpression,
): AirshipBehaviourClassDecorator | undefined {
	const typeChecker = state.typeChecker;
	const typeArguments = expression.typeArguments;

	if (!typeArguments || typeArguments.length === 0) {
		DiagnosticService.addDiagnostic(
			errors.requiredComponentTypeParameterRequired(classNode, classNode.name?.text || "<anonymous>"),
		);
		return undefined;
	}

	const componentParameters = new Array<AirshipBehaviourFieldDecoratorParameter>();
	for (const typeArgument of typeArguments) {
		const type = typeChecker.getTypeFromTypeNode(typeArgument);

		if (isAirshipBehaviourType(state, type)) {
			const typeString = typeChecker.typeToString(type);
			componentParameters.push({
				type: "AirshipBehaviour",
				value: typeString,
			});
		} else if (isUnityObjectType(state, type)) {
			const nonNullableType = typeChecker.getNonNullableType(type);
			const nonNullableTypeString = typeChecker.typeToString(nonNullableType);
			componentParameters.push({
				type: "object",
				value: nonNullableTypeString,
			});
		} else {
			const typeString = typeChecker.typeToString(type);
			DiagnosticService.addDiagnostic(
				errors.requiredComponentInvalidType(classNode, classNode.name?.text ?? "<anonymous>", typeString),
			);
		}
	}

	if (componentParameters.length === 0) {
		return undefined;
	}

	return {
		name: "RequireComponent",
		typeParameters: expression.typeArguments?.map(typeNode => {
			return state.typeChecker.typeToString(state.typeChecker.getTypeFromTypeNode(typeNode));
		}),
		parameters: componentParameters,
	};
}

function processGenericDecorator(
	state: TransformState,
	expression: ts.CallExpression,
	decoratorName: string,
): AirshipBehaviourClassDecorator {
	return {
		name: decoratorName,
		typeParameters: expression.typeArguments?.map(typeNode => {
			return state.typeChecker.typeToString(state.typeChecker.getTypeFromTypeNode(typeNode));
		}),
		parameters: expression.arguments.map((argument, i): AirshipBehaviourFieldDecoratorParameter => {
			const value = getMetadataValueFromNode(state, argument, false);

			if (value) {
				return value;
			} else {
				DiagnosticService.addDiagnostic(errors.decoratorParamsLiteralsOnly(expression.arguments[i]));

				return { type: "invalid", value: undefined };
			}
		}),
	};
}

export function getClassDecorators(state: TransformState, classNode: ts.ClassLikeDeclaration) {
	const decorators = ts.hasDecorators(classNode) ? ts.getDecorators(classNode) : undefined;
	if (!decorators) {
		return [];
	}

	const items = new Array<AirshipBehaviourClassDecorator>();

	for (const decorator of decorators) {
		const expression = decorator.expression;
		if (!ts.isCallExpression(expression)) continue;

		const aliasSymbol = state.typeChecker.getTypeAtLocation(expression).aliasSymbol;
		if (!aliasSymbol) continue;

		const airshipFieldSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("AirshipDecorator");
		if (aliasSymbol !== airshipFieldSymbol) continue;

		const decoratorName = expression.expression.getText();

		if (decoratorName === "RequireComponent") {
			const processedDecorator = processRequireComponentDecorator(state, classNode, expression);
			if (processedDecorator) {
				items.push(processedDecorator);
			}
		} else {
			const processedDecorator = processGenericDecorator(state, expression, decoratorName);
			items.push(processedDecorator);
		}
	}

	return items;
}

const onlyOneOf = ["AirshipComponentMenu", "AirshipComponentIcon"];
function pushOrReplaceDecorator(
	decorators: Array<AirshipBehaviourClassDecorator>,
	decorator: AirshipBehaviourClassDecorator,
) {
	if (onlyOneOf.includes(decorator.name)) {
		const existing = decorators.findIndex(f => f.name === decorator.name);
		if (existing != -1) {
			decorators[existing] = decorator;
		} else {
			decorators.push(decorator);
		}
	} else {
		const decoratorId = AirshipBehaviourClassDecorator.getId(decorator);
		if (!decorators.some(value => decoratorId === AirshipBehaviourClassDecorator.getId(value))) {
			decorators.push(decorator);
		}
	}
}

function getPropertyDecorators(
	state: TransformState,
	propertyNode: ts.PropertyDeclaration,
): Array<AirshipBehaviourFieldDecorator> {
	const decorators = ts.hasDecorators(propertyNode) ? ts.getDecorators(propertyNode) : undefined;
	if (decorators) {
		const items = new Array<AirshipBehaviourFieldDecorator>();

		for (const decorator of decorators) {
			const expression = decorator.expression;
			if (!ts.isCallExpression(expression)) continue;

			const aliasSymbol = state.typeChecker.getTypeAtLocation(expression).aliasSymbol;
			if (!aliasSymbol) continue;

			const airshipFieldSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("AirshipDecorator");

			if (aliasSymbol === airshipFieldSymbol) {
				items.push({
					name: expression.expression.getText(),
					parameters: expression.arguments.map((argument, i): AirshipBehaviourFieldDecoratorParameter => {
						const value = getMetadataValueFromNode(state, argument, true);
						if (value) {
							return value;
						} else {
							DiagnosticService.addDiagnostic(
								errors.decoratorParamsLiteralsOnly(expression.arguments[i]),
							);
							return { type: "invalid", value: undefined };
						}
					}),
				});
			}
		}

		return items;
	} else {
		return [];
	}
}

function pushPropertyMetadataForAirshipBehaviour(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	metadata: AirshipBehaviourJson | AirshipSerializable,
) {
	// iter props
	for (const classElement of node.members) {
		const elementType = state.getType(classElement);

		// skip anything that's not a property
		if (!ts.isPropertyDeclaration(classElement)) continue;

		const decorators = getPropertyDecorators(state, classElement);
		const isSerializeField = decorators.find(f => f.name === "SerializeField");

		// skip private, protected properties
		if (!isPublicWritablePropertyDeclaration(classElement) && !isSerializeField) {
			continue;
		}

		if (decorators.find(f => f.name === "NonSerialized")) continue;

		// only do valid exports
		if (!isValidAirshipBehaviourExportType(state, classElement)) continue;

		// can't add weird properties
		if (!ts.isIdentifier(classElement.name)) continue;

		// remove serialize field - doesn't need to be included
		if (isSerializeField) decorators.splice(decorators.indexOf(isSerializeField), 1);

		const name = classElement.name.text;
		const property = createAirshipProperty(state, name, elementType, classElement, decorators);

		metadata.properties.push(property);
	}
}

export function generateMetaForSerializable(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
): AirshipSerializable | undefined {
	const classType = state.typeChecker.getTypeAtLocation(node);

	if (node.name === undefined) {
		DiagnosticService.addDiagnostic(errors.airshipBehaviourNameRequired(node));
		return;
	}

	const serializable: Writable<AirshipSerializable> = {
		name: node.name.text ?? "<anonymous>",
		id: "",
		hash: "",
		properties: [],
	};

	pushPropertyMetadataForAirshipBehaviour(state, node, serializable);

	const sha1 = crypto.createHash("sha1");
	const hash = sha1.update(JSON.stringify(serializable)).digest("hex");
	serializable.hash = hash;

	const inheritance = getAncestorTypeSymbols(classType, state.typeChecker);
	const classDecorators = new Array<AirshipBehaviourClassDecorator>();

	for (const inherited of inheritance.reverse()) {
		const valueDeclaration = inherited.valueDeclaration;
		if (!valueDeclaration) continue;
		if (!ts.isClassLike(valueDeclaration)) continue;

		pushPropertyMetadataForAirshipBehaviour(state, valueDeclaration, serializable);

		let name = inherited.name;
		if (name === "default") {
			// not my favourite solution to this, but works...
			const valueDecl = inherited.valueDeclaration;
			if (valueDecl && ts.isClassDeclaration(valueDecl)) {
				name = valueDecl.name?.text ?? name;
			}
		}

		const inheritedClassDecorators = getClassDecorators(state, valueDeclaration);
		for (const decorator of inheritedClassDecorators) {
			pushOrReplaceDecorator(classDecorators, decorator);
		}
	}

	const uniqueId = state.airshipBuildState.getUniqueIdForClassDeclaration(state, node);
	const id =
		uniqueId ??
		path
			.relative(state.pathTranslator.outDir, state.pathTranslator.getOutputPath(node.getSourceFile().fileName))
			.replace(".lua", "") +
			"@" +
			node.name;

	serializable.id = id;

	return serializable;
}

function getAirshipClassMetadata(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	classType: ts.Type,
	inherits: ReadonlyArray<ts.Symbol>,
): [AirshipBehaviourJson, Array<string>] {
	const metadata: Writable<AirshipBehaviourJson> = {
		name: node.name?.text,
		properties: [],
		singleton: isAirshipSingletonClass(state, node),
		hash: "",
		decorators: undefined,
	};

	const inheritedBehaviourIds = new Array<string>();

	// Inheritance
	const inheritance = getAncestorTypeSymbols(classType, state.typeChecker);
	const classDecorators = new Array<AirshipBehaviourClassDecorator>();

	for (const inherited of inheritance.reverse()) {
		const valueDeclaration = inherited.valueDeclaration;
		if (!valueDeclaration) continue;
		if (!ts.isClassLike(valueDeclaration)) continue;
		if (inherits.includes(inherited)) continue;

		pushPropertyMetadataForAirshipBehaviour(state, valueDeclaration, metadata);

		let name = inherited.name;
		if (name === "default") {
			// not my favourite solution to this, but works...
			const valueDecl = inherited.valueDeclaration;
			if (valueDecl && ts.isClassDeclaration(valueDecl)) {
				name = valueDecl.name?.text ?? name;
			}
		}

		inheritedBehaviourIds.push(name);

		const inheritedClassDecorators = getClassDecorators(state, valueDeclaration);
		for (const decorator of inheritedClassDecorators) {
			pushOrReplaceDecorator(classDecorators, decorator);
		}
	}

	for (const decorator of getClassDecorators(state, node)) {
		pushOrReplaceDecorator(classDecorators, decorator);
	}

	pushPropertyMetadataForAirshipBehaviour(state, node, metadata);

	// const classDecorators = getClassDecorators(state, node);
	if (classDecorators.length > 0 && !state.data.isPublishing) metadata.decorators = classDecorators;

	const sha1 = crypto.createHash("sha1");
	const hash = sha1.update(JSON.stringify(metadata)).digest("hex");
	metadata.hash = hash;

	return [metadata, inheritedBehaviourIds];
}

export function generateMetaForAirshipScriptableObject(state: TransformState, node: ts.ClassLikeDeclaration) {
	const classType = state.typeChecker.getTypeAtLocation(node);

	const isDefault = (node.modifierFlagsCache & ModifierFlags.Default) !== 0;
	const isAbstract = (node.modifierFlagsCache & ModifierFlags.Abstract) !== 0;

	if (node.name === undefined) {
		DiagnosticService.addDiagnostic(errors.airshipBehaviourNameRequired(node));
		return;
	}

	const airshipBehaviour: Writable<AirshipBehaviour> = {
		name: node.name.text ?? "<anonymous>",
		metadata: undefined,
		id: "",
		extends: [],
	};

	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipScriptableObjectSymbolOrThrow();

	if (isDefault) {
		const [metadata, inheritedBehaviourIds] = getAirshipClassMetadata(state, node, classType, [
			airshipBehaviourSymbol,
		]);

		airshipBehaviour.metadata = metadata;
		airshipBehaviour.extends = inheritedBehaviourIds;
	} else {
		if (!isAbstract) {
			DiagnosticService.addDiagnostic(errors.airshipBehaviourModifiersRequired(node, node.name.text));
		}
	}

	const buildState = state.airshipBuildState;
	const editorInfo = buildState.editorInfo;
	const uniqueId = buildState.getUniqueIdForClassDeclaration(state, node);
	if (uniqueId) {
		const relPath = path.relative(state.pathTranslator.rootDir, node.getSourceFile().fileName).replace(/\\+/g, "/");

		(editorInfo.components ??= {})[uniqueId] = {
			assetPath: relPath,
			name: airshipBehaviour.metadata?.name ?? node.name.text,
		};
	}

	const id =
		uniqueId ??
		path
			.relative(state.pathTranslator.outDir, state.pathTranslator.getOutputPath(node.getSourceFile().fileName))
			.replace(".lua", "") +
			"@" +
			airshipBehaviour.name;

	airshipBehaviour.id = id;
	state.scriptableObjects.push(airshipBehaviour);
	return airshipBehaviour;
}

export function generateMetaForAirshipBehaviour(state: TransformState, node: ts.ClassLikeDeclaration) {
	const classType = state.typeChecker.getTypeAtLocation(node);

	const isDefault = (node.modifierFlagsCache & ModifierFlags.Default) !== 0;
	const isAbstract = (node.modifierFlagsCache & ModifierFlags.Abstract) !== 0;

	if (node.name === undefined) {
		DiagnosticService.addDiagnostic(errors.airshipBehaviourNameRequired(node));
		return;
	}

	const airshipBehaviour: Writable<AirshipBehaviour> = {
		name: node.name.text ?? "<anonymous>",
		metadata: undefined,
		id: "",
		extends: [],
	};

	const airshipBehaviourSymbol = state.services.airshipSymbolManager.getAirshipBehaviourSymbolOrThrow();
	const airshipSingletonSymbol = state.services.airshipSymbolManager.getAirshipSingletonSymbolOrThrow();

	if (isDefault) {
		const [metadata, inheritedBehaviourIds] = getAirshipClassMetadata(state, node, classType, [
			airshipBehaviourSymbol,
			airshipSingletonSymbol,
		]);

		airshipBehaviour.metadata = metadata;
		airshipBehaviour.extends = inheritedBehaviourIds;
	} else {
		if (!isAbstract) {
			DiagnosticService.addDiagnostic(errors.airshipBehaviourModifiersRequired(node, node.name.text));
		}
	}

	const buildState = state.airshipBuildState;
	const editorInfo = buildState.editorInfo;
	const uniqueId = buildState.getUniqueIdForClassDeclaration(state, node);
	if (uniqueId) {
		const relPath = path.relative(state.pathTranslator.rootDir, node.getSourceFile().fileName).replace(/\\+/g, "/");

		(editorInfo.components ??= {})[uniqueId] = {
			assetPath: relPath,
			name: airshipBehaviour.metadata?.name ?? node.name.text,
		};
	}

	const id =
		uniqueId ??
		path
			.relative(state.pathTranslator.outDir, state.pathTranslator.getOutputPath(node.getSourceFile().fileName))
			.replace(".lua", "") +
			"@" +
			airshipBehaviour.name;

	airshipBehaviour.id = id;

	state.airshipBehaviours.push(airshipBehaviour);

	return airshipBehaviour;
}
