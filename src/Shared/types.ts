import { ProjectType } from "Shared/constants";
import ts, { convertToBase64 } from "typescript";

export interface PackageJson {
	name: string;
	version: string;
	devDependencies: Record<string, string>;
	dependencies: Record<string, string>;
}

export interface TypeScriptConfiguration extends ts.TSConfig {
	/** @deprecated Now `airship` */
	rbxts: Partial<ProjectOptions> | undefined;
	airship: Partial<ProjectOptions> | undefined;
}

export interface ProjectOptions {
	includePath: string;
	package: string;
	runtimePath: string;
	incremental: boolean | undefined;
	rojo: string | undefined;
	type: ProjectType | undefined;
	logTruthyChanges: boolean;
	noInclude: boolean;
	usePolling: boolean;
	verbose: boolean;
	watch: boolean;
	json: boolean;
	publish: boolean;
	skipPackages: boolean;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	allowCommentDirectives: boolean;
	nodePackageName: string;
	copyNodeModules: boolean;
	precompiled: Array<string>;
	stripImplicitContextCalls: boolean;
}

export interface ProjectData {
	includePath: string;
	isSkippingPackages: boolean;
	isPackage: boolean;
	isPublishing: boolean;
	logTruthyChanges: boolean;
	nodeModulesPath: string;
	noInclude: boolean;
	projectOptions: ProjectOptions;
	projectPath: string;
	rojoConfigPath: string | undefined;
	tsConfigPath: string;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	stripImplicitContextCalls: boolean;
	watch: boolean;
	transformerWatcher?: TransformerWatcher;
}

export interface TransformerWatcher {
	service: ts.LanguageService;
	updateFile: (fileName: string, text: string) => void;
}

export interface TransformerCompilerArguments {
	packageDir: string;
	projectDir: string;
}

export interface TransformerPluginConfig {
	/**
	 * Path to transformer or transformer module name
	 */
	transform?: string;

	/**
	 * The optional name of the exported transform plugin in the transform module.
	 */
	import?: string;

	/**
	 * Plugin entry point format type, default is program
	 */
	type?: "program" | "config" | "checker" | "raw" | "compilerOptions";

	/**
	 * Should transformer applied after all ones
	 */
	after?: boolean;

	/**
	 * Should transformer applied for d.ts files, supports from TS2.9
	 */
	afterDeclarations?: boolean;

	/**
	 * any other properties provided to the transformer as config argument
	 * */
	[options: string]: unknown;

	/**
	 * Compiler arguments that transformers can use
	 */
	compiler: TransformerCompilerArguments;
}

export interface SourceFileWithTextRange {
	sourceFile: ts.SourceFile;
	range: ts.ReadonlyTextRange;
}

/**
 * The main JSON structure of the `AirshipBehaviour`
 */
export interface AirshipBehaviourJson {
	/**
	 * The name of the behaviour class
	 */
	readonly name: string | undefined;

	/**
	 * Whether or not this is a singleton
	 */
	readonly singleton: boolean;

	decorators: Array<AirshipBehaviourClassDecorator> | undefined;

	/**
	 * The hash of this AirshipBehaviour
	 */
	readonly hash: string;
	/**
	 * The AirshipBehaviour supported public serializable properties of the behaviour class
	 */
	readonly properties: Array<AirshipBehaviourFieldExport>;

	readonly serializables?: Array<AirshipSerializable>;
}

export enum EnumType {
	StringEnum,
	IntEnum,
	FlagEnum,
}

export interface AirshipBehaviour {
	readonly name: string;
	readonly id: string;

	readonly extends: Array<string>;
	readonly metadata: AirshipBehaviourJson | undefined;
}

export interface AirshipSerializable {
	readonly name: string;
	readonly id: string;

	/**
	 * The hash of this AirshipBehaviour
	 */
	readonly hash: string;
	/**
	 * The AirshipBehaviour supported public serializable properties of the behaviour class
	 */
	readonly properties: Array<AirshipBehaviourFieldExport>;
}

export interface AirshipScriptMetadata {
	readonly component?: AirshipBehaviourJson;
	readonly types?: { [P in string]: AirshipSerializable };
}

export interface AirshipBehaviourStaticMemberValue {
	target: "property";
	type: string;
	member: string;
	computed?: unknown;
}

export interface AirshipBehaviourStaticMemberValue {
	target: "property";
	type: string;
	member: string;
	computed?: unknown;
}

export interface AirshipBehaviourCallValue {
	target: "constructor";
	type: string;
	arguments: Array<unknown>;
	computed?: unknown;
}

export interface AirshipBehaviourMethodCallValue {
	target: "method";
	method: string;
	type: string;
	arguments: Array<unknown>;
	computed?: unknown;
}

type AirshipFieldDefaultValue =
	| string
	| number
	| boolean
	| AirshipBehaviourCallValue
	| AirshipBehaviourStaticMemberValue
	| AirshipBehaviourMethodCallValue
	| undefined;

export interface AirshipDocTag {
	name: string;
	text: string | undefined;
}

export interface AirshipDocComment {
	comment: string;
	comments?: Array<AirshipDocComment>;
	tags?: Array<AirshipDocTag>;
}

export type AirshipCommentData = AirshipDocComment | AirshipDocTag;

export interface AirshipFieldDocs {
	text?: Array<string>;
	tags?: Array<AirshipDocTag>;
}

/**
 * Metadata about a public serializable member in the AirshipBehaviour
 */
export interface AirshipBehaviourFieldExport extends AirshipTypeReference {
	/**
	 * The name of the property
	 */
	readonly name: string;

	readonly nullable?: boolean;

	readonly jsdoc?: AirshipFieldDocs;

	/**
	 * The comment description on this property
	 */
	readonly description?: string;

	readonly default: AirshipFieldDefaultValue | Array<AirshipFieldDefaultValue>;

	/**
	 * Item information about multi-item types such as Arrays
	 * - If `type` is `Array`: Will contain information about the array - `items.type` will be the array item type
	 */
	readonly items: AirshipTypeReference | undefined;
	/**
	 * Applied attributes (in TS, decorators) of this property
	 */
	readonly decorators: ReadonlyArray<AirshipBehaviourFieldDecorator>;

	/**
	 * A file reference for the given type (for `AirshipBehaviour`)
	 */
	readonly fileRef?: string;

	/**
	 * The Typescript reference id for the field (used for enums)
	 */
	readonly ref?: string;
}

interface AirshipTypeReference {
	/**
	 * The type of this reference
	 * - Primitive type e.g. `string`, `number`, `boolean`
	 * - Data type e.g. `Vector3`, `Vector2`, `Color` etc.
	 * - `Array` if it's an array
	 * - `AirshipBehaviour` (`AirshipComponent`)
	 * - `object` (`UnityEngine.Object`)
	 */
	readonly type: string;

	/**
	 * If {@link type} is set to
	 * - `"AirshipBehaviour"` - will contain the `AirshipComponent` name, {@link fileRef} will contain the script location relative to the project
	 * or
	 * - `"object"` - will contain the `UnityEngine.Object` type name
	 *
	 * otherwise `undefined`
	 */
	readonly objectType: string | undefined;
}

export interface AirshipBehaviourFieldDecoratorParameter {
	readonly value: unknown;
	readonly type: string;
}

/**
 * A decorator on the airship behaviour member
 */
export interface AirshipBehaviourFieldDecorator {
	/**
	 * The name of the attribute
	 */
	readonly name: string;
	/**
	 * The parameters of the attribute
	 *
	 * - If the decorator is a call e.g. `@decorator(...)` - `parameters` will be an array of the given arguments
	 * - If the decorator is a simple decorator, e.g. `@decorator` - `parameters` will be `undefined`.
	 */
	readonly parameters: ReadonlyArray<AirshipBehaviourFieldDecoratorParameter> | undefined;
}

export interface AirshipBehaviourClassDecorator {
	/**
	 * The name of the attribute
	 */
	readonly name: string;

	readonly typeParameters: ReadonlyArray<string> | undefined;
	/**
	 * The parameters of the attribute
	 *
	 * - If the decorator is a call e.g. `@decorator(...)` - `parameters` will be an array of the given arguments
	 * - If the decorator is a simple decorator, e.g. `@decorator` - `parameters` will be `undefined`.
	 */
	readonly parameters: ReadonlyArray<AirshipBehaviourFieldDecoratorParameter> | undefined;
}
export const AirshipBehaviourClassDecorator = {
	getId(this: void, value: AirshipBehaviourClassDecorator) {
		if (value.parameters) {
			return convertToBase64(
				`${value.name}(${value.parameters
					.map(v => {
						if (v.type === "string") {
							return `"${v.value}"`;
						} else {
							return v.value;
						}
					})
					.join(", ")})`,
			);
		} else {
			return `${value.name}`;
		}
	},
};

export interface AirshipBehaviourInfo {
	readonly filePath: string;
	readonly component: boolean;
	readonly singleton: boolean;
	readonly extends: Array<string>;
}

interface FlameworkBuildDecorator {
	name: string;
	internalId: string;
	isFlameworkDecorator: boolean;
}

interface FlameworkBuildClass {
	filePath: string;
	internalId: string;
	decorators: Array<FlameworkBuildDecorator>;
}

export interface FlameworkBuildInfo {
	version: number;
	identifierPrefix?: string;
	salt?: string;
	stringHashes?: { [key: string]: string };
	identifiers: { [key: string]: string };
	classes?: Array<FlameworkBuildClass>;
}

export interface AirshipBuildFile {
	readonly behaviours: Record<string, AirshipBehaviourInfo>; // TODO: Value
	readonly extends: Record<string, Array<string>>;
	readonly flamework: FlameworkBuildInfo;
}
