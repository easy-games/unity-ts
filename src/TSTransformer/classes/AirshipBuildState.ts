import { AirshipBuildFile } from "Shared/types";

interface EditorInfo {
	enum: Record<string, Record<string, string | number>>;
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
		enum: {},
	};

	public readonly fileComponentMap: Record<string, Array<string>> = {};
}
