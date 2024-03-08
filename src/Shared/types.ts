import { ProjectType } from "Shared/constants";
import ts from "typescript";

export interface ProjectOptions {
	includePath: string;
	rojo: string | undefined;
	type: ProjectType | undefined;
	logTruthyChanges: boolean;
	noInclude: boolean;
	usePolling: boolean;
	verbose: boolean;
	watch: boolean;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	allowCommentDirectives: boolean;
	nodePackageName: string | undefined;
	copyNodeModules: boolean;
}

export interface ProjectData {
	includePath: string;
	isPackage: boolean;
	logTruthyChanges: boolean;
	nodeModulesPath: string;
	noInclude: boolean;
	projectOptions: ProjectOptions;
	projectPath: string;
	rojoConfigPath: string | undefined;
	tsConfigPath: string;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	watch: boolean;
	transformerWatcher?: TransformerWatcher;
}

export interface TransformerWatcher {
	service: ts.LanguageService;
	updateFile: (fileName: string, text: string) => void;
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
	 * The hash of this AirshipBehaviour
	 */
	readonly hash: string;
	/**
	 * The AirshipBehaviour supported public serializable properties of the behaviour class
	 */
	readonly properties: Array<AirshipBehaviourFieldExport>;
}

export interface AirshipBehaviour {
	readonly name: string;
	readonly id: string;
	readonly extends: Array<string>;
	readonly metadata: AirshipBehaviourJson | undefined;
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

/**
 * Metadata about a public serializable member in the AirshipBehaviour
 */
export interface AirshipBehaviourFieldExport {
	/**
	 * The name of the property
	 */
	readonly name: string;
	/**
	 * The type of the property
	 */
	readonly type: string;

	readonly ref?: string;

	readonly nullable?: boolean;

	/**
	 * The comment description on this property
	 */
	readonly description?: string;

	readonly default: AirshipFieldDefaultValue | Array<AirshipFieldDefaultValue>;

	/**
	 * If type is `object` (i.e. UnityEngine.Object) - will contain the matching type
	 */
	readonly objectType: string | undefined;
	/**
	 * Item information about multi-item types such as Arrays
	 * - If `type` is `Array`: Will contain information about the array - `items.type` will be the array item type
	 */
	readonly items:
		| {
				/**
				 * The type of items in the collection (i.e. `Array`)
				 */
				type: string;
				/**
				 * If type is `object` (i.e. UnityEngine.Object) - will contain the matching type
				 */
				objectType: string | undefined;
		  }
		| undefined;
	/**
	 * Applied attributes (in TS, decorators) of this property
	 */
	readonly decorators: ReadonlyArray<AirshipBehaviourFieldDecorator>;
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

export interface AirshipBehaviourInfo {
	readonly filePath: string;
	readonly component: boolean;
	readonly extends: Array<string>;
}

export interface AirshipBuildFile {
	readonly behaviours: Record<string, AirshipBehaviourInfo>; // TODO: Value
	readonly extends: Record<string, Array<string>>;
}
