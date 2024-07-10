import fs from "fs-extra";
import path from "path";
import ts from "typescript";

export function getPackageDirectories(program: ts.BuilderProgram): ReadonlyArray<string> {
	const cwd = program.getCurrentDirectory();
	const packageList = new Array<string>();

	const packages = path.join(cwd, "AirshipPackages");
	for (const orgDirectoryName of fs.readdirSync(packages)) {
		const orgDirectoryPath = path.join(packages, orgDirectoryName);

		// Check is dir, then get sub dirs
		const stat = fs.statSync(orgDirectoryPath);
		if (stat.isDirectory()) {
			// get each sub dir of the org dir
			for (const packageDirectoryName of fs.readdirSync(orgDirectoryPath)) {
				const packageDirectoryPath = path.join(orgDirectoryPath, packageDirectoryName);
				const subStat = fs.statSync(packageDirectoryPath);
				if (subStat.isDirectory()) {
					packageList.push(path.join(packages, orgDirectoryName, packageDirectoryName));
				}
			}
		}
	}

	return packageList;
}
