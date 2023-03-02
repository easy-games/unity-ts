import fs from "fs-extra";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DTS_EXT } from "Shared/constants";

function isOutputFileOrphaned(pathTranslator: PathTranslator, filePath: string) {
	if (filePath.endsWith(DTS_EXT) && !pathTranslator.declaration) {
		return true;
	}

	// console.log("-------------------------");
	for (const path of pathTranslator.getInputPaths(filePath)) {
		if (path.endsWith(".lua")) {
			continue;
		}
		if (fs.pathExistsSync(path)) {
			return false;
		}
	}

	if (pathTranslator.buildInfoOutputPath === filePath) {
		return false;
	}

	return true;
}

export function tryRemoveOutput(pathTranslator: PathTranslator, outPath: string) {
	if (outPath.toLowerCase().endsWith("Resources") || outPath.toLowerCase().endsWith("Scenes")) {
		return;
	}
	if (outPath.toLowerCase().includes("Resources/") && !outPath.toLowerCase().includes("Resources/TS")) {
		// console.log("skipping " + outPath);
		return;
	}
	if (outPath.includes("Scenes/")) {
		// console.log("skipping " + outPath);
		return;
	}
	if (outPath.endsWith(".meta")) {
		return;
	}
	if (isOutputFileOrphaned(pathTranslator, outPath)) {
		fs.removeSync(outPath);
		LogService.writeLineIfVerbose(`remove ${outPath}`);
	}
}
