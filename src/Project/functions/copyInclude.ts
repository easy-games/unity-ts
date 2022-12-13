import copyfiles from "copyfiles";
import fs from "fs-extra";
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
		const nodeModules = data.includePath + "/../rbxts_include";
		// fs.copySync("node_modules/@easy-games/", nodeModules, {
		// 	dereference: true,
		// });
		copyfiles(["node_modules/@easy-games/**/*.lua", nodeModules], err => {
			resolve();
		});
		resolve();
	});
}
