import { readFileSync } from "fs";
import path from "path";
import { COMPILER_VERSION, ProjectType } from "Shared/constants";
import { AirshipBuildFile, FlameworkBuildInfo } from "Shared/types";
import { TransformState } from "TSTransformer/classes/TransformState";
import { FlameworkClassInfo } from "TSTransformer/flamework";
import { getEnumMetadata } from "TSTransformer/util/airshipBehaviourUtils";
import ts, { findPackageJson, getPackageJsonInfo } from "typescript";

export type EnumRecord = Record<string, string | number>;

interface EditorInfo {
	id: string;
	enum: Record<string, EnumRecord>;
}

export class AirshipBuildState {
	public readonly buildFile: AirshipBuildFile;
	public readonly singletonTypes = new Map<ts.SourceFile, Set<ts.Type>>();
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

	public readonly editorInfo: EditorInfo = {
		id: "typescript",
		enum: {},
	};

	public readonly fileComponentMap: Record<string, Array<string>> = {};

	public registerSingletonTypeForFile(file: ts.SourceFile, type: ts.Type) {
		let types = this.singletonTypes.get(file);
		if (!types) {
			types = new Set();
			this.singletonTypes.set(file, types);
		}

		types.add(type);
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
