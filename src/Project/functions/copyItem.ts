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

			if (data.projectOptions.writeOnlyChanged) {
				// console.log("skip:1 dest=" + dest + ", output=" + output);
				const destPath = pathTranslator.getOutputPath(dest);

				console.log("------");
				console.log("input: " + dest);
				console.log("output: " + destPath);
				console.log("------");

				// console.log("skip:1 destPath=" + destPath);
				if (fs.pathExistsSync(destPath)) {
					console.log("skip:2 src=" + src + " dest=" + destPath);
					if (!fs.lstatSync(src).isDirectory()) {
						console.log("skip:3");
						if (
							fs.existsSync(dest) &&
							fs.readFileSync(src).toString() === fs.readFileSync(destPath).toString()
						) {
							console.log("skip:4 SKIPPING!!");
							return false;
						}
					}
				}
			}

			if (src.endsWith(DTS_EXT)) {
				return pathTranslator.declaration;
			}

			// console.log(`${src} is compatible: ${isCompilableFile(src)}. output: ` + dest);
			const isCompilable = isCompilableFile(src);
			if (!isCompilable) {
				return true;
			}

			console.log("copying file: " + src);
			return false;
		},
		dereference: true,
	});
}
