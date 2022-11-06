import fs from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DTS_EXT } from "Shared/constants";

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	const output = pathTranslator.getOutputPath(item);
	// debugger;
	fs.copySync(item, output, {
		filter: (src, dest) => {
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

			return !isCompilableFile(src);
		},
		dereference: true,
	});
}
