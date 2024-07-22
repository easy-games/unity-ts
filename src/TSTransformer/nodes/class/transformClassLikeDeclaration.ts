import luau from "@roblox-ts/luau-ast";
import crypto from "crypto";
import path from "path";
import { errors } from "Shared/diagnostics";
import {
	AirshipBehaviour,
	AirshipBehaviourClassDecorator,
	AirshipBehaviourFieldDecorator,
	AirshipBehaviourFieldDecoratorParameter,
	AirshipBehaviourFieldExport,
	AirshipBehaviourJson,
	EnumType,
} from "Shared/types";
import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformDecorators } from "TSTransformer/nodes/class/transformDecorators";
import { transformPropertyDeclaration } from "TSTransformer/nodes/class/transformPropertyDeclaration";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import {
	EnumMetadata,
	getAncestorTypeSymbols,
	getEnumMetadata,
	getEnumValue,
	getUnityObjectInitializerDefaultValue,
	isEnumType,
	isPublicWritablePropertyDeclaration,
	isUnityObjectType,
	isValidAirshipBehaviourExportType,
} from "TSTransformer/util/airshipBehaviourUtils";
import {
	isAirshipBehaviourClass,
	isAirshipBehaviourType,
	isAirshipSingletonClass,
	isRootAirshipBehaviourClass,
	isRootAirshipSingletonClass,
} from "TSTransformer/util/extendsAirshipBehaviour";
import { getFlameworkNodeUid } from "TSTransformer/util/flameworkId";
import { generateFlameworkMetadataForClass, isFlameworkSingleton } from "TSTransformer/util/flameworkSingleton";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getKindName } from "TSTransformer/util/getKindName";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { validateMethodAssignment } from "TSTransformer/util/validateMethodAssignment";
import ts, { ModifierFlags } from "typescript";

const MAGIC_TO_STRING_METHOD = "toString";

function getConstructor(node: ts.ClassLikeDeclaration): (ts.ConstructorDeclaration & { body: ts.Block }) | undefined {
	return node.members.find(
		(element): element is ts.ConstructorDeclaration & { body: ts.Block } =>
			ts.isConstructorDeclaration(element) && element.body !== undefined,
	);
}

function createNameFunction(name: string) {
	return luau.create(luau.SyntaxKind.FunctionExpression, {
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.string(name),
			}),
		),
		parameters: luau.list.make(),
		hasDotDotDot: false,
	});
}

function createBoilerplate(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	className: luau.Identifier | luau.TemporaryIdentifier,
	isClassExpression: boolean,
) {
	const isAbstract = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Abstract);
	const statements = luau.list.make<luau.Statement>();

	/* boilerplate:
		className = setmetatable({}, {
			__tostring = function() return "className" end;
		});
		className.__index = className;
		function className.new(...)
			local self = setmetatable({}, className);
			self:constructor(...);
			return self;
		end;
		function className:constructor()
		end;
	*/

	// 	className = setmetatable({}, {
	// 		__tostring = function() return "className" end;
	// 		__index = super,
	//	});

	// if a class is abstract and it does not extend any class, it can just be a plain table
	// otherwise we can use the default boilerplate
	const extendsNode = getExtendsNode(node);
	if (isAbstract && !extendsNode) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: className,
				operator: "=",
				right: luau.mixedTable(),
			}),
		);
	} else {
		const metatableFields = luau.list.make<luau.MapField>();
		luau.list.push(
			metatableFields,
			luau.create(luau.SyntaxKind.MapField, {
				index: luau.strings.__tostring,
				value: createNameFunction(luau.isTemporaryIdentifier(className) ? "Anonymous" : className.name),
			}),
		);

		const isAirshipBehaviour = isRootAirshipBehaviourClass(state, node);
		const isAirshipSingleton = isRootAirshipSingletonClass(state, node);
		const isNotAirshipSpecialClass = !isAirshipBehaviour && !isAirshipSingleton;

		if (extendsNode && isNotAirshipSpecialClass) {
			const [extendsExp, extendsExpPrereqs] = state.capture(() =>
				transformExpression(state, extendsNode.expression),
			);
			const superId = luau.id("super");
			luau.list.pushList(statements, extendsExpPrereqs);
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: superId,
					right: extendsExp,
				}),
			);
			luau.list.push(
				metatableFields,
				luau.create(luau.SyntaxKind.MapField, {
					index: luau.strings.__index,
					value: superId,
				}),
			);
		}

		const metatable = luau.call(luau.globals.setmetatable, [
			luau.map(),
			luau.create(luau.SyntaxKind.Map, { fields: metatableFields }),
		]);

		if (isClassExpression && node.name) {
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: transformIdentifierDefined(state, node.name),
					right: metatable,
				}),
			);
		} else {
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: className,
					operator: "=",
					right: metatable,
				}),
			);
		}

		//	className.__index = className;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.property(className, "__index"),
				operator: "=",
				right: className,
			}),
		);
	}

	const ctor = getConstructor(node);

	// statements for className.new
	if (!isAbstract && !(isAirshipBehaviourClass(state, node) && ctor === undefined)) {
		const statementsInner = luau.list.make<luau.Statement>();

		//	local self = setmetatable({}, className);
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.globals.self,
				right: luau.call(luau.globals.setmetatable, [luau.map(), className]),
			}),
		);

		//	return self:constructor(...) or self;
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.binary(
					luau.create(luau.SyntaxKind.MethodCallExpression, {
						expression: luau.globals.self,
						name: "constructor",
						args: luau.list.make(luau.create(luau.SyntaxKind.VarArgsLiteral, {})),
					}),
					"or",
					luau.globals.self,
				),
			}),
		);

		//	function className.new(...)
		//	end;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.FunctionDeclaration, {
				name: luau.property(className, "new"),
				parameters: luau.list.make(),
				hasDotDotDot: true,
				statements: statementsInner,
				localize: false,
			}),
		);
	}

	return statements;
}

function extendsMacroClass(state: TransformState, node: ts.ClassLikeDeclaration) {
	const extendsNode = getExtendsNode(node);
	if (extendsNode) {
		const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
		if (symbol) {
			return (
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ArrayConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.SetConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.MapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakSetConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.WeakMapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMapConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySetConstructor) ||
				symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.CSDictionary)
			);
		}
	}
	return false;
}

/** Make all properties in T non-readonly. */
type Writable<T> = { -readonly [P in keyof T]: T[P] };

function isClassHoisted(state: TransformState, node: ts.ClassLikeDeclaration) {
	if (node.name) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol);
		return state.isHoisted.get(symbol) === true;
	}
	return false;
}

interface EnumWriteInfo {
	readonly enumTypeString: string;
	readonly enumRef: string;
}

function writeEnumInfo(
	state: TransformState,
	type: ts.Type,
	sourceFile: ts.SourceFile,
	enumInfo: EnumMetadata,
): EnumWriteInfo {
	const { record, enumType } = enumInfo;

	const enumName = state.airshipBuildState.getUniqueIdForType(state, type, sourceFile);
	const mts = state.airshipBuildState;
	if (mts.editorInfo.enum[enumName] === undefined) {
		mts.editorInfo.enum[enumName] = record;
	}

	return {
		enumTypeString: EnumType[enumType],
		enumRef: enumName,
	};
}

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
		} else {
			prop.items = {
				type: isObject ? "object" : typeString,
				objectType: isObject ? typeString : undefined,
			};
		}
	} else if (isAirshipBehaviourType(state, type)) {
		prop.type = "AirshipBehaviour";

		type = typeChecker.getNonNullableType(type);

		prop.objectType = typeChecker.typeToString(type);
		prop.fileRef = state.getOutputPathFromType(type);
	} else if (isEnum) {
		if (type.isNullableType()) prop.nullable = true;
		prop.nullable = type.isNullableType();
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
	} else {
		if (type.isNullableType()) prop.nullable = true;
		prop.nullable = type.isNullableType();
		prop.type = typeString;
	}

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

	prop.decorators = decorators;
	return prop;
}

export function getClassDecorators(state: TransformState, classNode: ts.ClassLikeDeclaration) {
	const decorators = ts.hasDecorators(classNode) ? ts.getDecorators(classNode) : undefined;
	if (decorators) {
		const items = new Array<AirshipBehaviourClassDecorator>();

		for (const decorator of decorators) {
			const expression = decorator.expression;
			if (!ts.isCallExpression(expression)) continue;

			const aliasSymbol = state.typeChecker.getTypeAtLocation(expression).aliasSymbol;
			if (!aliasSymbol) continue;

			const airshipFieldSymbol = state.services.airshipSymbolManager.getSymbolOrThrow("AirshipDecorator");

			if (aliasSymbol === airshipFieldSymbol) {
				items.push({
					name: expression.expression.getText(),
					typeParameters: expression.typeArguments?.map(typeNode => {
						return state.typeChecker.typeToString(state.typeChecker.getTypeFromTypeNode(typeNode));
					}),
					parameters: expression.arguments.map((argument, i): AirshipBehaviourFieldDecoratorParameter => {
						if (ts.isStringLiteral(argument)) {
							return { type: "string", value: argument.text };
						} else if (ts.isNumericLiteral(argument)) {
							return { type: "number", value: parseFloat(argument.text) };
						} else if (ts.isBooleanLiteral(argument)) {
							return {
								type: "boolean",
								value: argument.kind === ts.SyntaxKind.TrueKeyword ? true : false,
							};
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
						if (ts.isStringLiteral(argument)) {
							return { type: "string", value: argument.text };
						} else if (ts.isNumericLiteral(argument)) {
							return { type: "number", value: parseFloat(argument.text) };
						} else if (ts.isBooleanLiteral(argument)) {
							return {
								type: "boolean",
								value: argument.kind === ts.SyntaxKind.TrueKeyword ? true : false,
							};
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
	metadata: AirshipBehaviourJson,
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

function generateMetaForAirshipBehaviour(state: TransformState, node: ts.ClassLikeDeclaration) {
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
		const metadata: Writable<AirshipBehaviourJson> = {
			name: node.name?.text,
			properties: [],
			singleton: isAirshipSingletonClass(state, node),
			decorators: [],
			hash: "",
		};

		const inheritedBehaviourIds = new Array<string>();

		// Inheritance
		const inheritance = getAncestorTypeSymbols(classType);
		for (const inherited of inheritance) {
			const valueDeclaration = inherited.valueDeclaration;
			if (!valueDeclaration) continue;
			if (!ts.isClassLike(valueDeclaration)) continue;
			if (inherited === airshipBehaviourSymbol || inherited === airshipSingletonSymbol) continue;

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
		}

		pushPropertyMetadataForAirshipBehaviour(state, node, metadata);
		metadata.decorators = getClassDecorators(state, node);

		const sha1 = crypto.createHash("sha1");
		const hash = sha1.update(JSON.stringify(metadata)).digest("hex");
		metadata.hash = hash;

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

export function transformClassLikeDeclaration(state: TransformState, node: ts.ClassLikeDeclaration) {
	const isClassExpression = ts.isClassExpression(node);
	const statements = luau.list.make<luau.Statement>();

	const isExportDefault = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.ExportDefault);

	if (node.name) {
		validateIdentifier(state, node.name);
	}

	/*
		local className;
		do
			OOP boilerplate
			class functions
		end
	*/

	const shouldUseInternalName = isClassExpression && node.name !== undefined;

	let returnVar: luau.Identifier | luau.TemporaryIdentifier;
	if (shouldUseInternalName) {
		returnVar = luau.tempId("class");
	} else if (node.name) {
		returnVar = transformIdentifierDefined(state, node.name);
	} else if (isExportDefault) {
		returnVar = luau.id("default");
	} else {
		returnVar = luau.tempId("class");
	}

	let internalName: luau.Identifier | luau.TemporaryIdentifier;
	if (shouldUseInternalName) {
		internalName = node.name ? transformIdentifierDefined(state, node.name) : luau.tempId("class");
	} else {
		internalName = returnVar;
	}

	if (!isClassHoisted(state, node)) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: returnVar,
				right: undefined,
			}),
		);
	}

	if (extendsMacroClass(state, node)) {
		DiagnosticService.addDiagnostic(errors.noMacroExtends(node));
	}

	if (isAirshipBehaviourClass(state, node)) {
		// const isDefault = (node.modifierFlagsCache & ModifierFlags.Default) !== 0;
		const isExport = (node.modifierFlagsCache & ModifierFlags.Export) !== 0;
		if (isExport) {
			generateMetaForAirshipBehaviour(state, node)!;
		}
	}

	// OOP boilerplate + class functions
	const statementsInner = luau.list.make<luau.Statement>();
	luau.list.pushList(statementsInner, createBoilerplate(state, node, internalName, isClassExpression));

	luau.list.pushList(statementsInner, transformClassConstructor(state, node, internalName, getConstructor(node)));

	for (const member of node.members) {
		if (
			(ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) &&
			(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
			luau.isReservedClassField(member.name.text)
		) {
			DiagnosticService.addDiagnostic(errors.noReservedClassFields(member.name));
		}
	}

	const methods = new Array<ts.MethodDeclaration>();
	const staticProperties = new Array<ts.PropertyDeclaration>();
	for (const member of node.members) {
		validateMethodAssignment(state, member);
		if (
			ts.isConstructorDeclaration(member) ||
			ts.isIndexSignatureDeclaration(member) ||
			ts.isSemicolonClassElement(member)
		) {
			continue;
		} else if (ts.isMethodDeclaration(member)) {
			methods.push(member);
		} else if (ts.isPropertyDeclaration(member)) {
			// do not emit non-static properties here
			if (!ts.hasStaticModifier(member)) {
				continue;
			}
			staticProperties.push(member);
		} else if (ts.isAccessor(member)) {
			DiagnosticService.addDiagnostic(errors.noGetterSetter(member));
		} else {
			assert(false, `ClassMember kind not implemented: ${getKindName(member.kind)}`);
		}
	}

	const classType = state.typeChecker.getTypeOfSymbolAtLocation(node.symbol, node);
	const instanceType = state.typeChecker.getDeclaredTypeOfSymbol(node.symbol);

	for (const method of methods) {
		if (ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)) {
			if (luau.isMetamethod(method.name.text)) {
				DiagnosticService.addDiagnostic(errors.noClassMetamethods(method.name));
			}

			if (!!ts.getSelectedSyntacticModifierFlags(method, ts.ModifierFlags.Static)) {
				if (instanceType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noInstanceMethodCollisions(method));
				}
			} else {
				if (classType.getProperty(method.name.text) !== undefined) {
					DiagnosticService.addDiagnostic(errors.noStaticMethodCollisions(method));
				}
			}
		}

		luau.list.pushList(
			statementsInner,
			transformMethodDeclaration(state, method, { name: "name", value: internalName }),
		);
	}

	const toStringProperty = instanceType.getProperty(MAGIC_TO_STRING_METHOD);
	if (toStringProperty && !!(toStringProperty.flags & ts.SymbolFlags.Method)) {
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.MethodDeclaration, {
				expression: internalName,
				name: "__tostring",
				hasDotDotDot: false,
				parameters: luau.list.make(),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
							expression: luau.globals.self,
							name: MAGIC_TO_STRING_METHOD,
							args: luau.list.make(),
						}),
					}),
				),
			}),
		);
	}

	for (const property of staticProperties) {
		luau.list.pushList(statementsInner, transformPropertyDeclaration(state, property, internalName));
	}

	// if using internal name, assign to return var
	if (shouldUseInternalName) {
		luau.list.push(
			statementsInner,
			luau.create(luau.SyntaxKind.Assignment, {
				left: returnVar,
				operator: "=",
				right: internalName,
			}),
		);
	}

	luau.list.pushList(statementsInner, transformDecorators(state, node, returnVar));

	const isFlameworkSingletonClass = isFlameworkSingleton(state, node);
	if (isFlameworkSingletonClass) {
		// Handle flamework classes
		const flameworkMetadata = generateFlameworkMetadataForClass(state, node);
		luau.list.pushList(statementsInner, flameworkMetadata);
		luau.list.unshift(
			statements,
			luau.comment(`▼ Airship Flamework Class '${getFlameworkNodeUid(state, node)}' ▼`),
		);
	}

	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.DoStatement, {
			statements: statementsInner,
		}),
	);

	const behaviourInfo = state.airshipBehaviours.find(f => f.name === node.name?.text);
	if (behaviourInfo) {
		if (behaviourInfo.metadata) {
			luau.list.unshift(
				statements,
				luau.comment(
					`▼ AirshipBehaviour Component '${behaviourInfo.id}' (${behaviourInfo.metadata?.hash ?? ""}) ▼`,
				),
			);
			luau.list.push(statements, luau.comment(`▲ AirshipBehaviour Component ▲`));
		} else {
			luau.list.unshift(statements, luau.comment(`▼ AirshipBehaviour Class '${behaviourInfo.id}' ▼`));
			luau.list.push(statements, luau.comment(`▲ AirshipBehaviour Class ▲`));
		}
	} else if (isFlameworkSingletonClass) {
		luau.list.push(statements, luau.comment(`▲ Airship Flamework Class ▲`));
	}

	return { statements, name: returnVar };
}
