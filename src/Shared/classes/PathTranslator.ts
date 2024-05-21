import path from "path";
import {
	D_EXT,
	DTS_EXT,
	INDEX_NAME,
	INIT_NAME,
	JSON_EXT,
	JSON_META_EXT,
	LUA_EXT,
	ProjectType,
	TS_EXT,
	TSX_EXT,
} from "Shared/constants";
import { ProjectOptions } from "Shared/types";
import { assert } from "Shared/util/assert";

// eslint-disable-next-line no-restricted-imports

class PathInfo {
	private constructor(public dirName: string, public fileName: string, public exts: Array<string>) {}

	public static from(filePath: string) {
		const dirName = path.dirname(filePath);
		const parts = filePath.slice(dirName.length + path.sep.length).split(".");
		const fileName = parts.shift();
		const exts = parts.map(v => "." + v);
		assert(fileName !== undefined);
		return new PathInfo(dirName, fileName, exts);
	}

	public extsPeek(depth = 0): string | undefined {
		return this.exts[this.exts.length - (depth + 1)];
	}

	public join(): string {
		return path.join(this.dirName, [this.fileName, ...this.exts].join(""));
	}
}

export class PathTranslator {
	constructor(
		public readonly rootDir: string,
		public readonly outDir: string,
		public readonly buildInfoOutputPath: string | undefined,
		public readonly declaration: boolean,
		public readonly projectOptions: ProjectOptions,
	) {}

	private makeRelativeFactory(from = this.rootDir, to = this.outDir) {
		return (pathInfo: PathInfo) => path.join(to, path.relative(from, pathInfo.join()));
	}

	// public getUnityPathFromTSFilePath(tsFilePath: string): string {
	// 	LogService.writeLine("ts file path: " + tsFilePath);
	// 	let unityPath = tsFilePath.replace(".ts", ".lua");

	// 	unityPath = unityPath.replace("src/", "");
	// 	unityPath = unityPath.replace("Client/", "Client/Resources/TS/");
	// 	unityPath = unityPath.replace("Server/", "Server/Resources/TS/");
	// 	unityPath = unityPath.replace("Shared/", "Shared/Resources/TS/");

	// 	LogService.writeLine("unity file path: " + unityPath);
	// 	return unityPath;
	// }

	/**
	 * Maps an input path to an output path
	 * - `.tsx?` && !`.d.tsx?` -> `.lua`
	 * 	- `index` -> `init`
	 * - `src/*` -> `out/*`
	 */
	public getOutputPath(filePath: string) {
		const makeRelative = this.makeRelativeFactory();
		filePath = path.join(filePath);

		const isLegacyProject = filePath.includes("Assets/Bundles");

		if (isLegacyProject) {
			if (this.projectOptions.type !== ProjectType.AirshipBundle) {
				if (filePath.includes(path.join("src", "Shared"))) {
					filePath = filePath.replace(path.join("src/Shared"), path.join("src/Shared/Resources/TS"));
				} else if (filePath.includes(path.join("src/Server"))) {
					filePath = filePath.replace(path.join("src/Server"), path.join("src/Server/Resources/TS"));
				} else if (filePath.includes(path.join("src/Client"))) {
					filePath = filePath.replace(path.join("src/Client"), path.join("src/Client/Resources/TS"));
				} else if (filePath.includes(path.join("src/CoreClient"))) {
					filePath = filePath.replace(path.join("src/CoreClient"), path.join("src/CoreClient/Resources/TS"));
				} else if (filePath.includes(path.join("src/CoreServer"))) {
					filePath = filePath.replace(path.join("src/CoreServer"), path.join("src/CoreServer/Resources/TS"));
				} else if (filePath.includes(path.join("src/CoreShared"))) {
					filePath = filePath.replace(path.join("src/CoreShared"), path.join("src/CoreShared/Resources/TS"));
				}
			}

			let hasImports = false;
			if (filePath.includes(path.join("@"))) {
				hasImports = true;
				if (filePath.includes(path.join("/Shared"))) {
					filePath = filePath.replace(path.join("/Shared"), path.join("/Shared/Resources/TS"));
				} else if (filePath.includes(path.join("/Server"))) {
					filePath = filePath.replace(path.join("/Server"), path.join("/Server/Resources/TS"));
				} else if (filePath.includes(path.join("/Client"))) {
					filePath = filePath.replace(path.join("/Client"), path.join("/Client/Resources/TS"));
				}
			}
		}

		const pathInfo = PathInfo.from(filePath);

		if (
			(pathInfo.extsPeek() === TS_EXT ||
				pathInfo.extsPeek() === JSON_META_EXT ||
				pathInfo.extsPeek() === TSX_EXT ||
				pathInfo.extsPeek() === JSON_EXT) &&
			pathInfo.extsPeek(1) !== D_EXT
		) {
			const isJson = pathInfo.extsPeek() === JSON_EXT;

			pathInfo.exts.pop(); // pop .tsx?

			// // index -> init
			// if (pathInfo.fileName === INDEX_NAME) {
			// 	pathInfo.fileName = INIT_NAME;
			// }

			if (isJson) {
				pathInfo.exts.push(".json");
			}

			pathInfo.exts.push(LUA_EXT);
		}

		let relative = makeRelative(pathInfo);
		return relative;
	}

	/**
	 * Maps an input path to an output .d.ts path
	 * - `.tsx?` && !`.d.tsx?` -> `.d.ts`
	 * - `src/*` -> `out/*`
	 */
	public getOutputDeclarationPath(filePath: string) {
		const makeRelative = this.makeRelativeFactory();
		const pathInfo = PathInfo.from(filePath);

		if ((pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) && pathInfo.extsPeek(1) !== D_EXT) {
			pathInfo.exts.pop(); // pop .tsx?
			pathInfo.exts.push(DTS_EXT);
		}

		return makeRelative(pathInfo);
	}

	/**
	 * Maps an output path to possible import paths
	 * - `.lua` -> `.tsx?`
	 * 	- `init` -> `index`
	 * - `out/*` -> `src/*`
	 */
	public getInputPaths(filePath: string) {
		const makeRelative = this.makeRelativeFactory(this.outDir, this.rootDir);
		let possiblePaths = new Array<string>();
		const pathInfo = PathInfo.from(filePath);

		// index.*.lua cannot come from a .ts file
		if (pathInfo.extsPeek() === LUA_EXT && pathInfo.fileName !== INDEX_NAME) {
			pathInfo.exts.pop();

			// ts
			pathInfo.exts.push(TS_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();

			// tsx
			pathInfo.exts.push(TSX_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();

			// init -> index
			if (pathInfo.fileName === INIT_NAME) {
				const originalFileName = pathInfo.fileName;
				pathInfo.fileName = INDEX_NAME;

				// index.*.ts
				pathInfo.exts.push(TS_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				// index.*.tsx
				pathInfo.exts.push(TSX_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				pathInfo.fileName = originalFileName;
			}

			pathInfo.exts.push(LUA_EXT);
		}

		// Check for .lua.json~ "sources" (should be the relevant .ts files)
		if (pathInfo.extsPeek() == JSON_META_EXT && pathInfo.extsPeek(1) == LUA_EXT) {
			pathInfo.exts.pop();
			pathInfo.exts.pop();

			// ts
			pathInfo.exts.push(TS_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();

			// tsx
			pathInfo.exts.push(TSX_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();
		}

		if (this.declaration) {
			if ((pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) && pathInfo.extsPeek(1) === D_EXT) {
				const tsExt = pathInfo.exts.pop(); // pop .tsx?
				assert(tsExt);
				pathInfo.exts.pop(); // pop .d

				// .ts
				pathInfo.exts.push(TS_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				// .tsx
				pathInfo.exts.push(TSX_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				pathInfo.exts.push(D_EXT);
				pathInfo.exts.push(tsExt);
			}
		}

		possiblePaths.push(makeRelative(pathInfo));

		possiblePaths = possiblePaths.map(filePath => {
			if (filePath.includes(path.join("src/Shared/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/Shared/Resources/TS"), path.join("src/Shared"));
			} else if (filePath.includes(path.join("src/Server/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/Server/Resources/TS"), path.join("src/Server"));
			} else if (filePath.includes(path.join("src/Client/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/Client/Resources/TS"), path.join("src/Client"));
			} else if (filePath.includes(path.join("src/CoreShared/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/CoreShared/Resources/TS"), path.join("src/CoreShared"));
			} else if (filePath.includes(path.join("src/CoreServer/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/CoreServer/Resources/TS"), path.join("src/CoreServer"));
			} else if (filePath.includes(path.join("src/CoreClient/Resources/TS"))) {
				filePath = filePath.replace(path.join("src/CoreClient/Resources/TS"), path.join("src/CoreClient"));
			}

			if (filePath.includes("@")) {
				if (filePath.includes(path.join("/Shared/Resources/TS"))) {
					filePath = filePath.replace(path.join("/Shared/Resources/TS"), path.join("/Shared"));
				} else if (filePath.includes(path.join("/Server/Resources/TS"))) {
					filePath = filePath.replace(path.join("/Server/Resources/TS"), path.join("/Server"));
				} else if (filePath.includes(path.join("/Client/Resources/TS"))) {
					filePath = filePath.replace(path.join("/Client/Resources/TS"), path.join("/Client"));
				}
			}
			return filePath;
		});

		return possiblePaths;
	}

	/**
	 * Maps a src path to an import path
	 * - `.d.tsx?` -> `.tsx?` -> `.lua`
	 * 	- `index` -> `init`
	 */
	public getImportPath(filePath: string, isNodeModule = false) {
		const makeRelative = this.makeRelativeFactory();
		const pathInfo = PathInfo.from(filePath);

		if (pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) {
			pathInfo.exts.pop(); // pop .tsx?
			if (pathInfo.extsPeek() === D_EXT) {
				pathInfo.exts.pop(); // pop .d
			}

			// // index -> init
			// if (pathInfo.fileName === INDEX_NAME) {
			// 	pathInfo.fileName = INIT_NAME;
			// }

			pathInfo.exts.push(LUA_EXT); // push .lua
		}

		return isNodeModule ? pathInfo.join() : makeRelative(pathInfo);
	}
}
