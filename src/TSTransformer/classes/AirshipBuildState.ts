import { readFileSync } from "fs";
import path from "path";
import { ProjectType } from "Shared/constants";
import { AirshipBuildFile } from "Shared/types";
import { TransformState } from "TSTransformer/classes/TransformState";
import { getEnumMetadata } from "TSTransformer/util/airshipBehaviourUtils";
import ts, { findPackageJson, getPackageJsonInfo } from "typescript";

export type EnumRecord = Record<string, string | number>;

interface EditorInfo {
	id: string;
	enum: Record<string, EnumRecord>;
}

export class AirshipBuildState {
	public readonly buildFile: AirshipBuildFile;

	public constructor(buildFile?: AirshipBuildFile) {
		this.buildFile = buildFile ?? {
			behaviours: {},
			extends: {},
		};
	}

	public readonly editorInfo: EditorInfo = {
		id: "typescript",
		enum: {},
	};

	public readonly fileComponentMap: Record<string, Array<string>> = {};

	public getEnumById(id: string): EnumRecord | undefined {
		return this.editorInfo.enum[id];
	}

	private typeIdCache = new Map<number, string>();
	public getUniqueIdForType(transformState: TransformState, type: ts.Type, sourceFile: ts.SourceFile) {
		if (this.typeIdCache.has(type.id)) {
			return this.typeIdCache.get(type.id)!;
		}

		const pathTranslator = transformState.pathTranslator;
		const typeChecker = transformState.typeChecker;

		const parsePath = path.parse(
			path
				.relative(pathTranslator.outDir, pathTranslator.getOutputPath(sourceFile.fileName))
				.replace("../../Bundles/Types~/", ""),
		);

		const typeName = typeChecker.typeToString(type);
		let value = (parsePath.dir + path.sep + parsePath.name + "@" + typeName).replace(/\\/g, "/");

		if (transformState.projectType === ProjectType.AirshipBundle) {
			const pkgJson: { name: string } = JSON.parse(
				readFileSync(path.join(transformState.program.getCurrentDirectory(), "package.json")).toString(),
			);
			value = pkgJson.name + "/" + value;
		}

		this.typeIdCache.set(type.id, value);
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
