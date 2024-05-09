import fs, { readdirSync } from "fs-extra";
import path from "path";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DTS_EXT, JSON_EXT, LUA_EXT, META_EXT } from "Shared/constants";

export const isUnityFile = (file: string) => {
	return file.endsWith(META_EXT);
};

export const isCopyableFile = (file: string) => {
	return file.endsWith(LUA_EXT) || file.endsWith(DTS_EXT) || file.endsWith(JSON_EXT);
};

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	const output = pathTranslator.getOutputPath(item);

	// Exclude meta files
	if (!isCopyableFile(item)) return;

	// Can't copy out
	if (output == pathTranslator.outDir) return;

	const getDirectories = (source: string) => readdirSync(source, { withFileTypes: true }).map(dirent => dirent.name);

	// debugger;
	fs.copySync(item, output, {
		filter: (src, dest) => {
			if (fs.lstatSync(item).isDirectory()) {
				for (let child of getDirectories(src)) {
					copyItem(data, pathTranslator, path.join(item, child));
				}
				return false;
			}

			if (
				data.writeOnlyChanged &&
				fs.pathExistsSync(dest) &&
				!fs.lstatSync(src).isDirectory() &&
				fs.readFileSync(src).toString() === fs.readFileSync(dest).toString()
			) {
				return false;
			}

			if (src.endsWith(DTS_EXT)) {
				return pathTranslator.declaration;
			}

			let result = !isCompilableFile(src);
			return result;
		},
		dereference: true,
	});
}
