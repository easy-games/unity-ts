import crypto from "crypto";
import fs, { readdirSync } from "fs-extra";
import { ProjectData } from "Project";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { DTS_EXT } from "Shared/constants";

function generateChecksum(str: string) {
	return crypto.createHash("md5").update(str).digest("hex");
}

export function copyItem(data: ProjectData, pathTranslator: PathTranslator, item: string) {
	const output = pathTranslator.getOutputPath(item);

	const getDirectories = (source: string) => readdirSync(source, { withFileTypes: true }).map(dirent => dirent.name);

	console.log("fs.copySync item=" + item + ", output=" + output);

	// debugger;
	fs.copySync(item, output, {
		filter: (src, dest) => {
			console.log("filter src=" + src + ", dest=" + dest);
			if (fs.lstatSync(item).isDirectory()) {
				// for (let child of getDirectories(src)) {
				// 	copyItem(data, pathTranslator, path.join(item, child));
				// }
				// return false;
			}

			if (src.endsWith(DTS_EXT)) {
				return pathTranslator.declaration;
			}

			// console.log(`${src} is compatible: ${isCompilableFile(src)}. output: ` + dest);
			const isTSFile = isCompilableFile(src);
			if (isTSFile) {
				// don't copy source files (.ts)
				return false;
			}

			// if (data.projectOptions.writeOnlyChanged) {
			// 	// console.log("skip:1 dest=" + dest + ", output=" + output);
			// 	const destPath = pathTranslator.getOutputPath(dest);

			// 	console.log("------");
			// 	console.log("input: " + dest);
			// 	console.log("output: " + destPath);
			// 	console.log("------");

			// 	const srcContents = fs.readFileSync(src).toString();
			// 	const newSrcChecksum = generateChecksum(srcContents);

			// 	// console.log("skip:1 destPath=" + destPath);
			// 	if (fs.pathExistsSync(destPath)) {
			// 		console.log("skip:2 src=" + src + " dest=" + destPath);
			// 		if (!fs.lstatSync(src).isDirectory()) {
			// 			console.log("skip:3");
			// 			if (fs.existsSync(dest)) {
			// 				console.log("skip:4");
			// 				const srcContents = fs.readFileSync(src).toString();
			// 				const newSrcChecksum = generateChecksum(srcContents);
			// 				const existingChecksum = checksumFileData[src];
			// 				if (existingChecksum !== undefined) {
			// 					if (newSrcChecksum === existingChecksum) {
			// 						console.log("checksum matched. skipping: " + src);
			// 						return true;
			// 					}
			// 				}
			// 			}
			// 		}
			// 	}

			// 	checksumFileData[src] = newSrcChecksum;
			// }

			console.log("copying file: " + src);
			return false;
		},
		dereference: true,
	});
}
