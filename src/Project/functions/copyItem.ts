import fs, { readdirSync } from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DTS_EXT } from "Shared/constants";

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	const output = pathTranslator.getOutputPath(item);

	const getDirectories = (source: string) => readdirSync(source, { withFileTypes: true }).map(dirent => dirent.name);

	// debugger;
	fs.copySync(item, output, {
		filter: (src, dest) => {
			if (fs.lstatSync(item).isDirectory()) {
				// for (let child of getDirectories(src)) {
				// 	copyItem(data, pathTranslator, path.join(item, child));
				// }
				// return false;
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

			console.log(`${src} is compatible: ${isCompilableFile(src)}. output: ` + dest);
			return !isCompilableFile(src);
		},
		dereference: true,
	});
}
