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

	const importsDir = path.join(outDir, "Imports");
	if (!fs.existsSync(importsDir)) {
		fs.mkdirSync(importsDir);
	}
	const files = fs.readdirSync(importsDir, { withFileTypes: true });
	for (const file of files) {
		if (file.isDirectory()) {
			console.log("found bundle: " + file + "\n");
			dirsToCleanup.push(file.name);
		}
	}

	for (let dir of dirsToCleanup) {
		if (fs.pathExistsSync(dir)) {
			cleanupDirRecursively(pathTranslator, dir);
		}
	}
}
