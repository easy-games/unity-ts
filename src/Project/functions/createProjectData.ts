import fs from "fs-extra";
import path from "path";
import { NODE_MODULES } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectData, ProjectOptions } from "Shared/types";
import ts from "typescript";

const PACKAGE_REGEX = /^@[a-z0-9-]*\//;

export function createProjectData(
	tsConfigPath: string,
	packageDir: string,
	projectOptions: ProjectOptions,
): ProjectData {
	const pkgJsonPath = ts.findPackageJson(packageDir, ts.sys as unknown as ts.LanguageServiceHost);
	if (!pkgJsonPath) {
		throw new ProjectError(`Unable to find package.json in ${packageDir}`);
	}

	let isPackage = false;
	try {
		const pkgJson: { name: string } = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		isPackage = PACKAGE_REGEX.test(pkgJson.name ?? "");
	} catch (e) {
		// errors if no pkgJson, so assume not a package
	}

	const logTruthyChanges = projectOptions.logTruthyChanges;
	const noInclude = projectOptions.noInclude;

	// intentionally use || here for empty string case
	const includePath = path.resolve(projectOptions.includePath || path.join(packageDir, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES);

	const writeOnlyChanged = projectOptions.writeOnlyChanged;
	const optimizedLoops = projectOptions.optimizedLoops;
	const watch = projectOptions.watch;

	const projectData: ProjectData = {
		tsConfigPath,
		includePath,
		isPackage,
		isPublishing: projectOptions.publish,
		logTruthyChanges,
		noInclude,
		nodeModulesPath,
		projectOptions,
		projectPath: packageDir,
		rojoConfigPath: undefined,
		writeOnlyChanged,
		optimizedLoops,
		watch,
	};
	return projectData;
}
