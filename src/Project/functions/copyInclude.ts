import copyfiles from "copyfiles";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { INCLUDE_PATH, ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (
		!data.noInclude &&
		data.projectOptions.type !== ProjectType.Package &&
		!(data.projectOptions.type === undefined && data.isPackage)
	) {
		benchmarkIfVerbose("copy include files", () => {
			fs.copySync(INCLUDE_PATH, data.includePath, { dereference: true });
		});
	}
}

export async function copyNodeModules(data: ProjectData) {
	return new Promise<void>((resolve, reject) => {
		LogService.writeLine("Copying node_modules...");
		const nodeModules = path.join(data.projectPath, "..", "Bundles", "Shared", "Resources", "rbxts_include");
		copyfiles(
			["node_modules/@easy-games/**/*.lua", nodeModules],
			{
				soft: false,
			},
			err => {
				if (err) {
					LogService.writeLine("Failed to copy node_modules:");
					console.error(err);
				} else {
					LogService.writeLine("Finished copying node_modules");
				}
				resolve();
			},
		);
	});
}
