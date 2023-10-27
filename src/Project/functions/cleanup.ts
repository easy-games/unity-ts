import { existsSync, writeFileSync } from "fs";
import fs from "fs-extra";
import path from "path";
import { tryRemoveOutput } from "Project/functions/tryRemoveOutput";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { ProjectOptions } from "Shared/types";

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
	const outDir = pathTranslator.outDir;
	const dirsToCleanup = [
		path.join(outDir, "Client", "Resources", "TS"),
		path.join(outDir, "Server", "Resources", "TS"),
		path.join(outDir, "Shared", "Resources", "TS"),
	];

	// if (projectOptions.type === ProjectType.Game) {
	// 	const importsDir = path.join(outDir, "Imports");
	// 	if (!fs.existsSync(importsDir)) {
	// 		fs.mkdirSync(importsDir);
	// 	}
	// 	const files = fs.readdirSync(importsDir, { withFileTypes: true });
	// 	for (const file of files) {
	// 		if (file.isDirectory()) {
	// 			console.log("found bundle: " + file + "\n");
	// 			dirsToCleanup.push(file.name);
	// 		}
	// 	}
	// }

	for (let dir of dirsToCleanup) {
		if (fs.pathExistsSync(dir)) {
			cleanupDirRecursively(pathTranslator, dir);
		}
	}

	addPackageIndexFiles(pathTranslator, projectOptions);
}
function addPackageIndexFiles(pathTranslator: PathTranslator, projectOptions: ProjectOptions): void {
	let typesDir: string;
	if (projectOptions.type === ProjectType.AirshipBundle) {
		typesDir = path.join("../../../Types~/");
	} else if (projectOptions.type === ProjectType.Game) {
		typesDir = path.join("../Bundles/Types~/");
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
