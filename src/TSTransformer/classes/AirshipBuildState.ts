import { AirshipBuildFile } from "Shared/types";

export class AirshipBuildState {
	public readonly buildFile: AirshipBuildFile;

	public constructor(buildFile?: AirshipBuildFile) {
		this.buildFile = buildFile ?? {
			behaviours: {},
			extends: {},
		};
	}

	public readonly fileComponentMap: Record<string, Array<string>> = {};
}
