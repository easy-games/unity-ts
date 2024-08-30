import { existsSync, readFileSync } from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { AirshipBehaviour, AirshipBehaviourInfo, AirshipBuildFile, FlameworkBuildInfo } from "Shared/types";
import { TransformState } from "TSTransformer/classes/TransformState";
import { FlameworkClassInfo } from "TSTransformer/flamework";
import { getEnumMetadata } from "TSTransformer/util/airshipBehaviourUtils";
import ts from "typescript";

export type EnumRecord = Record<string, string | number>;

interface EditorInfo {
	id: string;
	components: Record<
		string,
		{
			name: string | undefined;
			assetPath: string;
		}
	>;
	enum: Record<string, EnumRecord>;
}

export const BUILD_FILE = "Airship.asbuildinfo";
export const EDITOR_FILE = "TypeScriptEditorMetadata.aseditorinfo";

export class AirshipBuildState {
	public buildFile: AirshipBuildFile;
	public readonly singletonTypes = new Map<string, Set<number>>();
	public readonly classes = new Map<ts.Symbol, FlameworkClassInfo>();

	public constructor(buildFile?: AirshipBuildFile) {
		this.buildFile = buildFile ?? {
			behaviours: {},
			extends: {},
			flamework: {
				version: 1,
				identifiers: {},
			} satisfies FlameworkBuildInfo,
		};
	}

	public readonly fileComponentMap: Record<string, Array<string>> = {};

	public editorInfo: EditorInfo = {
		id: "typescript",
		components: {},
		enum: {},
	};

	public cleanup(pathTranslator: PathTranslator) {
		if (this.editorInfo.components === undefined) return;
		for (const [, component] of Object.entries(this.editorInfo.components)) {
			const fullPath = path.join(pathTranslator.rootDir, component.assetPath);

			if (existsSync(fullPath)) continue;
			if (!component.name) continue;

			delete this.buildFile.behaviours[component.name];
			delete this.buildFile.extends[component.name];
		}
	}

	public linkBehaviourToFile(component: AirshipBehaviour, sourceFile: ts.SourceFile) {
		const fileMap = (this.fileComponentMap[sourceFile.fileName] ??= []);
		fileMap.push(component.name);
	}

	public registerBehaviour(behaviour: AirshipBehaviour, relativeFilePath: string) {
		this.buildFile.behaviours[behaviour.name] = {
			component: behaviour.metadata !== undefined,
			filePath: relativeFilePath,
			extends: behaviour.extends,
			singleton: behaviour.metadata?.singleton || false,
		};
	}

	public registerBehaviourInheritance(behaviour: AirshipBehaviour) {
		for (const ext of behaviour.extends) {
			const extensions = (this.buildFile.extends[ext] ??= []);

			if (!extensions.includes(behaviour.name)) {
				extensions.push(behaviour.name);
			}
		}
	}

	public unlinkBehavioursAtFilePath(filePath: string) {
		const components = this.fileComponentMap[filePath];
		if (components === undefined) return;

		for (const componentId of components) {
			for (const [, extensions] of Object.entries(this.buildFile.extends)) {
				if (!extensions.includes(componentId)) continue;
				extensions.splice(extensions.indexOf(componentId), 1);
			}
			delete this.buildFile.behaviours[componentId];
		}
	}

	public registerSingletonTypeForFile(file: ts.SourceFile, type: ts.Type) {
		let types = this.singletonTypes.get(file.fileName);
		if (!types) {
			types = new Set();
			this.singletonTypes.set(file.fileName, types);
		}

		types.add(type.id);
	}

	private isBuildFile(data: unknown): data is AirshipBuildFile {
		if (data === null) return false;
		if (typeof data !== "object") return false;
		return "extends" in data && "behaviours" in data && "flamework" in data;
	}

	public loadBuildFile(filePath: string) {
		if (existsSync(filePath)) {
			const source = readFileSync(filePath).toString();
			const buildFile = JSON.parse(source) as unknown;
			if (this.isBuildFile(buildFile)) {
				this.buildFile = buildFile;
				return buildFile;
			} else {
				LogService.warn(`Failed to build file at path ${filePath}`);
			}
		}
	}

	private isEditorInfo(data: unknown): data is EditorInfo {
		if (data === null) return false;
		if (typeof data !== "object") return false;
		return "id" in data && "components" in data && "enum" in data;
	}

	public loadEditorInfo(filePath: string) {
		if (existsSync(filePath)) {
			const source = readFileSync(filePath).toString();
			const editorInfo = JSON.parse(source) as unknown;
			if (this.isEditorInfo(editorInfo)) {
				this.editorInfo = editorInfo;
				return editorInfo;
			} else {
				LogService.warn(`Failed to load editor info at path ${filePath}`);
			}
		}
	}

	public getEnumById(id: string): EnumRecord | undefined {
		return this.editorInfo.enum[id];
	}

	private idLookup = new Map<string, string>();
	public getFlameworkIdentifier(internalId: string) {
		return this.idLookup.get(internalId);
	}

	public addFlameworkIdentifier(internalId: string, id: string) {
		this.buildFile.flamework.identifiers[internalId] = id;
		this.idLookup.set(internalId, id);
	}

	private typeIdCache = new Map<string, string>();
	public getUniqueIdForType(transformState: TransformState, type: ts.Type, sourceFile: ts.SourceFile) {
		const fullTypePath = sourceFile.fileName + "@" + transformState.typeChecker.typeToString(type);

		if (this.typeIdCache.has(fullTypePath)) {
			return this.typeIdCache.get(fullTypePath)!;
		}

		const pathTranslator = transformState.pathTranslator;
		const typeChecker = transformState.typeChecker;

		const parsePath = path.parse(
			path
				.relative(pathTranslator.outDir, pathTranslator.getOutputPath(sourceFile.fileName))
				.replace("../../Bundles/Types~/", ""),
		);

		const typeName = typeChecker.typeToString(type);
		const value = (parsePath.dir + path.sep + parsePath.name + "@" + typeName).replace(/\\/g, "/");

		this.typeIdCache.set(fullTypePath, value);
		return value;
	}

	public getUniqueIdForEnumDeclaration(state: TransformState, declaration: ts.EnumDeclaration) {
		const type = state.typeChecker.getTypeAtLocation(declaration);
		if (type) {
			return this.getUniqueIdForType(state, type, declaration.getSourceFile());
		}
	}

	public getUniqueIdForClassDeclaration(state: TransformState, declaration: ts.ClassLikeDeclaration) {
		const type = state.typeChecker.getTypeAtLocation(declaration);
		if (type) {
			return this.getUniqueIdForType(state, type, declaration.getSourceFile());
		}
	}

	public updateEnumDeclaration(state: TransformState, declaration: ts.EnumDeclaration) {
		const id = this.getUniqueIdForEnumDeclaration(state, declaration);
		const type = state.typeChecker.getTypeAtLocation(declaration);
		if (type && id) {
			const enumMetadata = getEnumMetadata(type)?.record;
			if (!enumMetadata) return;

			this.editorInfo.enum[id] = enumMetadata;
		}
	}
}
