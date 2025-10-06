import kleur from "kleur";
import { SourceFileWithTextRange } from "Shared/types";
import { createDiagnosticWithLocation } from "Shared/util/createDiagnosticWithLocation";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import ts, { Type, TypeChecker } from "typescript";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DiagnosticFactory<T extends Array<any> = []> = {
	(node: ts.Node | SourceFileWithTextRange, ...context: T): ts.DiagnosticWithLocation;
	id: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DiagnosticContextFormatter<T extends Array<any> = []> = (...context: T) => Array<string | false>;

const REPO_URL = "https://github.com/easy-games/unity-ts";

function suggestion(text: string) {
	return "Suggestion: " + kleur.yellow(text);
}

function issue(id: number) {
	return "More information: " + kleur.grey(`${REPO_URL}/issues/${id}`);
}

let id = 0;

/**
 * Returns a `DiagnosticFactory` that includes a function used to generate a readable message for the diagnostic.
 * @param messages The list of messages to include in the error report.
 */
function diagnostic(category: ts.DiagnosticCategory, ...messages: Array<string | false>): DiagnosticFactory {
	return diagnosticWithContext(category, undefined, ...messages);
}

/**
 * Returns a `DiagnosticFactory` that includes a function used to generate a readable message for the diagnostic.
 * The context is additonal data from the location where the diagnostic occurred that is used to generate dynamic
 * messages.
 * @param contextFormatter An optional function to format the context parameter for this diagnostic. The returned
 * formatted messages are displayed last in the diagnostic report.
 * @param messages The list of messages to include in the diagnostic report.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diagnosticWithContext<T extends Array<any> = []>(
	category: ts.DiagnosticCategory,
	contextFormatter?: DiagnosticContextFormatter<T>,
	...messages: Array<string | false>
): DiagnosticFactory<T> {
	const result = (node: ts.Node | SourceFileWithTextRange, ...context: T) => {
		if (category === ts.DiagnosticCategory.Error) {
			debugger;
		}

		if (contextFormatter) {
			messages.push(...contextFormatter(...context));
		}

		return createDiagnosticWithLocation(result.id, messages.filter(v => v !== false).join("\n"), category, node);
	};
	result.id = id++;
	return result;
}

function diagnosticText(category: ts.DiagnosticCategory, ...messages: Array<string | false>) {
	return createTextDiagnostic(messages.filter(v => v !== false).join("\n"), category);
}

function error(...messages: Array<string | false>): DiagnosticFactory {
	return diagnostic(ts.DiagnosticCategory.Error, ...messages);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorWithContext<T extends Array<any> = []>(
	contextFormatter: DiagnosticContextFormatter<T>,
	...messages: Array<string | false>
): DiagnosticFactory<T> {
	return diagnosticWithContext(ts.DiagnosticCategory.Error, contextFormatter, ...messages);
}

function warningWithContext<T extends Array<any> = []>(
	contextFormatter: DiagnosticContextFormatter<T>,
	...messages: Array<string | false>
): DiagnosticFactory<T> {
	return diagnosticWithContext(ts.DiagnosticCategory.Warning, contextFormatter, ...messages);
}

function errorText(...messages: Array<string>) {
	return diagnosticText(ts.DiagnosticCategory.Error, ...messages);
}

function warning(...messages: Array<string>): DiagnosticFactory {
	return diagnostic(ts.DiagnosticCategory.Warning, ...messages);
}

function warningText(...messages: Array<string>) {
	return diagnosticText(ts.DiagnosticCategory.Warning, ...messages);
}

export function getDiagnosticId(diagnostic: ts.Diagnostic): number {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (diagnostic as any).id;
}

/**
 * Defines diagnostic error messages
 */
export const errors = {
	// reserved identifiers
	noInvalidIdentifier: error(
		"Invalid identifier!",
		"identifiers must start with a letter and only contain letters, numbers, and underscores.",
	),
	noInvalidReservedIdentifier: errorWithContext((keyword: string) => {
		return [`${keyword} is a reserved keyword and cannot be used as an identifier.`];
	}),
	noReservedIdentifier: error("Cannot use identifier reserved for compiler internal usage."),
	noReservedClassFields: error("Cannot use class field reserved for compiler internal usage."),
	noClassMetamethods: error("Metamethods cannot be used in class definitions!"),

	// banned statements
	noForInStatement: error("for-in loop statements are not supported!"),
	noLabeledStatement: error("labels are not supported!"),
	noDebuggerStatement: error("`debugger` is not supported!"),

	// banned expressions
	noNullLiteral: error("`null` is not supported!", suggestion("Use `undefined` instead.")),
	noPrivateIdentifier: error("Private identifiers are not supported!"),
	noTypeOfExpression: error(
		"`typeof` operator is not supported!",
		suggestion("Use `typeIs(value, type)` or `typeOf(value)` instead."),
	),
	noRegex: error("Regular expressions are not supported!"),
	noBigInt: error("BigInt literals are not supported!"),

	// banned features
	noAny: error("Using values of type `any` is not supported!", suggestion("Use `unknown` instead.")),
	noVar: error("`var` keyword is not supported!", suggestion("Use `let` or `const` instead.")),
	noUsing: error("`using` keyword is not supported!", suggestion("Use `let` or `const` instead.")),
	noGetterSetter: error("Getters and Setters are not supported!", issue(457)),
	noEqualsEquals: error("operator `==` is not supported!", suggestion("Use `===` instead.")),
	noExclamationEquals: error("operator `!=` is not supported!", suggestion("Use `!==` instead.")),
	noComma: error("operator `,` is not supported!"),
	noEnumMerging: error("Enum merging is not supported!"),
	noNamespaceMerging: error("Namespace merging is not supported!"),
	noSpreadDestructuring: error("Operator `...` is not supported for destructuring!"),
	unsupportedSpreadDestructing: errorWithContext((checker: TypeChecker, type: Type) => {
		return [`Operator \`...\` is not supported for type '${checker.typeToString(type)}'`];
	}),
	noSpreadOnUnityObjects: errorWithContext((typeName: string) => {
		return [`Operator \`...\` is not supported on C# type ${typeName}!`];
	}),
	noSpreadOnDataTypes: errorWithContext((checker: TypeChecker, type: Type) => {
		return [`Operator \`...\` is not supported for data type '${checker.typeToString(type)}'`];
	}),
	noNestedSpreadsInAssignmentPatterns: error("Nesting spreads in assignment patterns is not supported!"),
	noFunctionExpressionName: error("Function expression names are not supported!"),
	noPrecedingSpreadElement: error("Spread element must come last in a list of arguments!"),
	noLuaTupleDestructureAssignmentExpression: error(
		"Cannot destructure LuaTuple<T> expression outside of an ExpressionStatement!",
	),
	noExportAssignmentLet: error("Cannot use `export =` on a `let` variable!", suggestion("Use `const` instead.")),
	noGlobalThis: error("`globalThis` is not supported!"),
	noArguments: error("`arguments` is not supported!"),
	noPrototype: error("`prototype` is not supported!"),
	noSuperProperty: error("super properties are not supported!"),
	noNonNumberStringRelationOperator: error("Relation operators can only be used on number or string types!"),
	noInstanceMethodCollisions: error("Static methods cannot use the same name as instance methods!"),
	noReservedAirshipIdentifier: error("Cannot use identifier reserved for AirshipBehaviour usage."),
	noStaticMethodCollisions: error("Instance methods cannot use the same name as static methods!"),
	noUnaryPlus: error("Unary `+` is not supported!", suggestion("Use `tonumber(x)` instead.")),
	noNonNumberUnaryMinus: error("Unary `-` is only supported for number types!"),
	noAwaitForOf: error("`await` is not supported in for-of loops!"),
	noAsyncGeneratorFunctions: error("Async generator functions are not supported!"),
	noNonStringModuleSpecifier: error("Module specifiers must be a string literal."),
	noIterableIteration: error("Iterating on Iterable<T> is not supported! You must use a more specific type."),
	noLuaTupleInTemplateExpression: error(
		"Can't use LuaTuple<T> in a template literal expression!",
		suggestion("Did you mean to add `[0]`?"),
	),
	noMixedTypeCall: error(
		"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
	),
	noIndexWithoutCall: error(
		"Cannot index a method without calling it!",
		suggestion("Use the form `() => a.b()` instead of `a.b`."),
	),
	noCommentDirectives: error(
		"Usage of `@ts-ignore`, `@ts-expect-error`, and `@ts-nocheck` are not supported!",
		"unity-ts needs type and symbol info to compile correctly.",
		suggestion("Consider using type assertions or `declare` statements."),
	),

	// macro methods
	noOptionalMacroCall: error(
		"Macro methods can not be optionally called!",
		suggestion("Macros always exist. Use a normal call."),
	),
	noConstructorMacroWithoutNew: error("Cannot index a constructor macro without using the `new` operator!"),
	noMacroExtends: error("Cannot extend from a macro class!"),
	noMacroUnion: error("Macro cannot be applied to a union type!"),
	noMacroObjectSpread: error(
		"Macro classes cannot be used in an object spread!",
		suggestion("Did you mean to use an array spread? `[ ...exp ]`"),
	),
	noVarArgsMacroSpread: error("Macros which use variadric arguments do not support spread expressions!", issue(1149)),
	noRangeMacroOutsideForOf: error("$range() macro is only valid as an expression of a for-of loop!"),
	noTupleMacroOutsideReturn: error("$tuple() macro is only valid as an expression of a return statement!"),

	// import/export
	noModuleSpecifierFile: error("Could not find file for import. Did you forget to `npm install`?"),
	noInvalidModule: error("You can only use npm scopes that are listed in your typeRoots."),
	noUnscopedModule: error("You cannot use modules directly under node_modules."),
	noNonModuleImport: error("Cannot import a non-ModuleScript!"),
	noIsolatedImport: error("Attempted to import a file inside of an isolated container from outside!"),
	noServerImport: error(
		"Cannot import a server file from a shared or client location!",
		suggestion("Move the file you want to import to a shared location."),
	),

	// roact jsx
	invalidJsxFactory: error("compilerOptions.jsxFactory must be `Roact.createElement`!"),
	invalidJsxFragmentFactory: error("compilerOptions.jsxFragmentFactory must be `Roact.createFragment`!"),
	noRoactInheritance: error(
		"Composition is preferred over inheritance with Roact components.",
		"More info: https://reactjs.org/docs/composition-vs-inheritance.html",
	),
	noSuperPropertyCallRoactComponent: error("`super` is not supported inside Roact components!"),
	missingSuperConstructorRoactComponent: error(
		"`super(props)` must be the first statement of the constructor in a Roact component!",
	),
	noJsxText: error("JSX text is not supported!"),

	// semantic
	expectedMethodGotFunction: error("Attempted to assign non-method where method was expected."),
	expectedFunctionGotMethod: error("Attempted to assign method where non-method was expected."),

	airshipBehaviourNameRequired: error("AirshipBehaviour must contain a class name"),
	airshipBehaviourModifiersRequired: errorWithContext((className: string) => {
		return [
			`AirshipBehaviour "${className}" requires a 'default' or 'abstract' modifier`,
			suggestion("Use 'default' if this is a component"),
			suggestion("Use 'abstract' if this is not a component itself, but base component logic"),
		];
	}),

	invalidServerMacroUse: error("invalid"),

	requiredComponentTypeParameterRequired: errorWithContext((className: string) => {
		return [
			`@RequireComponent decorator on class '${className}' requires at least one type parameter`,
			suggestion(
				"Use @RequireComponent<ComponentType>() where ComponentType is a Unity component or AirshipBehaviour",
			),
		];
	}),

	requiredComponentArgumentRequired: errorWithContext((className: string) => {
		return [
			`@RequireComponent decorator on class '${className}' requires at least one type parameter`,
			suggestion(
				"Use @RequireComponent<ComponentType>() where ComponentType is a Unity component or AirshipBehaviour",
			),
		];
	}),

	requiredComponentInvalidType: errorWithContext((className: string, typeName: string) => {
		return [
			`@RequireComponent decorator on class '${className}' received invalid component type '${typeName}'`,
			suggestion(
				"Component type must be a Unity component or AirshipBehaviour. Try @RequireComponent<ValidComponentType>()",
			),
		];
	}),

	requiredComponentInvalidArgument: errorWithContext((className: string, argumentType: string) => {
		return [
			`@RequireComponent decorator on class '${className}' received invalid argument of type '${argumentType}'`,
			suggestion(
				"Use @RequireComponent<ComponentType>() where ComponentType is a Unity component or AirshipBehaviour",
			),
		];
	}),

	unityMacroTypeArgumentRequired: errorWithContext((methodName: string) => {
		return [
			`Macro ${methodName}<T>() requires a type argument at T`,
			suggestion("Try adding a type argument to the function call"),
		];
	}),

	unityMacroExpectsAirshipComponentTypeArgument: errorWithContext(
		(type: string, name: string, isUnityObjectType: boolean) => {
			if (isUnityObjectType) {
				return [
					`${type} is a Unity Component, not an Airship Component`,
					suggestion(`Change this call to ${name}<${type}>()`),
				];
			} else {
				return [`${type} is not a derived type of AirshipBehaviour`];
			}
		},
	),

	unityMacroExpectsComponentTypeArgument: errorWithContext(
		(type: string, name: string, isAirshipBehaviourType: boolean) => {
			if (isAirshipBehaviourType) {
				return [
					`${type} is an Airship Component, not a Unity Component`,
					suggestion(`Change this call to ${name}<${type}>()`),
				];
			} else {
				return [`${type} is not a derived type of Component`];
			}
		},
	),

	decoratorParamsLiteralsOnly: error(
		"Airship Behaviour decorators only accept literal `string`, `boolean` or `number` values. For RequireComponent, use `typeof(ComponentType)` syntax.",
	),

	// files
	noRojoData: errorWithContext((path: string, isPackage: boolean) => [
		`Could not find Rojo data. There is no $path in your Rojo config that covers ${path}`,
		isPackage && suggestion(`Did you forget to add a custom npm scope to your default.project.json?`),
	]),
	incorrectFileName: (originalFileName: string, suggestedFileName: string, fullPath: string) =>
		errorText(
			`Incorrect file name: \`${originalFileName}\`!`,
			`Full path: ${fullPath}`,
			suggestion(`Change \`${originalFileName}\` to \`${suggestedFileName}\`.`),
		),
	rojoPathInSrc: (partitionPath: string, suggestedPath: string) =>
		errorText(
			`Invalid Rojo configuration. $path fields should be relative to out directory.`,
			suggestion(`Change the value of $path from "${partitionPath}" to "${suggestedPath}".`),
		),

	// Flamework
	dependencyInjectionNoType: errorWithContext(() => {
		return [
			"Macro Dependency<T> requires a type argument at T",
			suggestion("Try adding a type argument to the function call"),
		];
	}),

	invalidDirectiveUsage: errorWithContext<[directive: "$SERVER" | "$CLIENT"]>(directive => {
		return [`${directive} can only be used within an if statement, e.g. if (${directive})`];
	}),

	invalidDirectiveUsageWithConditionalExpression: errorWithContext<["$SERVER" | "$CLIENT", ts.ConditionalExpression]>(
		directive => {
			return [
				`Conditional expressions only support using a single directive (e.g. ${directive} ? whenTrue : whenFalse)`,
			];
		},
	),

	invalidDirectiveUsageWithBinaryExpression: errorWithContext<["$SERVER" | "$CLIENT", ts.BinaryExpression]>(
		(directive, binaryExpression) => {
			if (binaryExpression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
				return [
					`This conditional is too complex for usage with a ${directive} directive, you can only a one-level AND (&&) - e.g. if (${directive} && otherCondition)`,
					suggestion(
						`Wrap the non-directive conditional in a variable, and use it with ${directive}, e.g. if (${directive} && otherCondition), where otherCondition is the variable.`,
					),
				];
			} else {
				return [
					`A conditional containing a directive can only be an AND (&&) expression, e.g. ${binaryExpression.left.getText()} && ${binaryExpression.right.getText()}`,
				];
			}
		},
	),

	flameworkIdNoType: errorWithContext(() => {
		return [
			"Macro Flamework.id<T> requires a type argument at T",
			suggestion("Try adding a type argument to the function call"),
		];
	}),

	dependencyInjectionNoConstructor: errorWithContext(() => {
		return [
			"Macro Dependency(C) requires a valid constructor argument at C",
			suggestion("It is recommended you use Dependency<T>() rather than Dependency(C)"),
		];
	}),

	expectedTypeReference: errorWithContext((_typeNode: ts.TypeNode) => {
		return ["Function expects a type reference"];
	}),
};

export const warnings = {
	truthyChange: (checksStr: string) => warning(`Value will be checked against ${checksStr}`),
	stringOffsetChange: (text: string) => warning(`String macros no longer offset inputs: ${text}`),

	unityMacroAsExpressionWarning: (methodName: string, typeName: string) =>
		warning(`The call to ${methodName}() should be written as ${methodName}<${typeName}>()`),

	transformerNotFound: (name: string, err: unknown) =>
		warningText(
			`Transformer \`${name}\` was not found!`,
			"More info: " + err,
			suggestion("Did you forget to install the package?"),
		),
	runtimeLibUsedInReplicatedFirst: warning(
		"This statement would generate a call to the runtime library. The runtime library should not be used from ReplicatedFirst.",
	),

	dependencyInjectionDeprecated: warningWithContext((id: ts.Identifier) => {
		return [
			"This usage of Dependency is deprecated and will be removed in future",
			suggestion("Please use Dependency<" + id.text + ">()"),
		];
	}),

	invalidDefaultValueForProperty: warning(
		"Property is public, and has a default value set that will not be visible in editor",
		"use @NonSerialized() if you do not intend for this property to be serialized.",
	),

	flameworkTransformer: {
		file: undefined,
		code: " unity-ts" as unknown as number,
		category: ts.DiagnosticCategory.Warning,
		start: 0,
		length: 0,
		messageText:
			"You are using an external version of Flamework (@easy-games/unity-flamework-transformer) in your 'plugins' of tsconfig.json - " +
			"please remove this from the file as it will not be maintained in future.",
	} satisfies ts.Diagnostic,

	genericBehaviourReference: warningWithContext(() => {
		return [
			"Generic AirshipBehaviours cannot be exposed to the inspector",
			suggestion(
				"to turn off this warning, put @NonSerialized() in front of this property or create a behaviour that inherits this class with the generic types you expect",
			),
		];
	}),

	flameworkDependencyRaceCondition: warning(
		"The Dependency macro should not be used outside of a function as this may introduce race conditions.",
	),

	directiveIsAlwaysFalse: warning("This expression will always be false"),
};
