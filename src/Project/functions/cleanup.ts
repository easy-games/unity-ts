import fs from "fs-extra";
import path from "path";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { PathTranslator } from "Shared/classes/PathTranslator";

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

export function cleanup(pathTranslator: PathTranslator) {
	const outDir = pathTranslator.outDir;
	const dirsToCleanup = [
		path.join(outDir, "Client", "Resources", "TS"),
		path.join(outDir, "Server", "Resources", "TS"),
		path.join(outDir, "Shared", "Resources", "TS"),
	];

	for (let dir of dirsToCleanup) {
		if (fs.pathExistsSync(dir)) {
			cleanupDirRecursively(pathTranslator, dir);
		}
	}
}
