import { existsSync, writeFileSync } from "fs";
import fs from "fs-extra";
import path from "path";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { ProjectOptions } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

function cleanupDirRecursively(pathTranslator: PathTranslator, dir: string) {
	if (fs.pathExistsSync(dir)) {
		for (const name of fs.readdirSync(dir)) {
			const itemPath = path.join(dir, name);
			if (fs.statSync(itemPath).isDirectory()) {
				if (name === ".git" || name === ".gitkeep") {
					continue;
				}
				cleanupDirRecursively(pathTranslator, itemPath);
			}
			tryRemoveOutput(pathTranslator, itemPath);
		}
	}
}

export function cleanup(pathTranslator: PathTranslator, projectOptions: ProjectOptions) {
	benchmarkIfVerbose(`cleanup orphaned files`, () => {
		const outDir = pathTranslator.outDir;

		let dirsToCleanup: Array<string>;

		const isLegacyProject = outDir.includes("Assets/Bundles");
		if (isLegacyProject) {
			// Handle legacy compiler stuff
			dirsToCleanup = [
				path.join(outDir, "Client", "Resources", "TS"),
				path.join(outDir, "Server", "Resources", "TS"),
				path.join(outDir, "Shared", "Resources", "TS"),
			];
		} else {
			dirsToCleanup = [path.join(outDir)];
		}

		for (const dir of dirsToCleanup) {
			if (fs.pathExistsSync(dir)) {
				cleanupDirRecursively(pathTranslator, dir);
			}
		}

		addPackageIndexFiles(pathTranslator, projectOptions);
	});
}
function addPackageIndexFiles(pathTranslator: PathTranslator, projectOptions: ProjectOptions): void {
	let typesDir: string;
	if (projectOptions.type === ProjectType.AirshipBundle) {
		typesDir = path.join("../../../Types~/");
		// } else if (projectOptions.type === ProjectType.Game) {
		// 	typesDir = path.join("../Bundles/Types~/");
	} else {
		LogService.writeLine("Skipping package index file gen.");
		return;
	}
	const files = fs.readdirSync(typesDir, { withFileTypes: true });
	for (const file of files) {
		if (!file.isDirectory()) continue;

		const indexPath = path.join(typesDir, file.name, "index.d.ts");
		if (!existsSync(indexPath)) {
			writeFileSync(indexPath, "");
		}
	}
}
