// eslint-disable-next-line @typescript-eslint/ban-types

import path from "path";
import { ProjectData } from "Shared/types";
import ts, { DiagnosticMessageChain, LineAndCharacter } from "typescript";

interface WatchReport {
	messageText: string;
	category: ts.DiagnosticCategory;
}

interface EditorFileDiagnostic {
	filePath: string | undefined;
	message: string | DiagnosticMessageChain | undefined;
	code: number | string;
	category: ts.DiagnosticCategory;
	position: number | undefined;
	source: string | undefined;
	line: number | undefined;
	column: number | undefined;
	length: number | undefined;
	text: string | undefined;
}

interface CompiledFile {
	readonly fileName: string;
}
interface CompiledFileWrite {
	readonly fileName: string;
	readonly changed: boolean;
}

interface StartCompile {
	initial: boolean;
	count: number;
}
interface FinishCompile {}

interface RpcType {
	watchReport: WatchReport;
	fileDiagnostic: EditorFileDiagnostic;
	compiledFile: CompiledFile;
	compiledFileWrite: CompiledFileWrite;
	transformFile: CompiledFile;
	startingCompile: StartCompile;
	finishedCompile: FinishCompile;
	finishedCompileWithErrors: FinishCompile & { errorCount: number };
	rpcInputError: {
		error: unknown;
	};
}

export interface InputEvent<T extends object = object> {
	readonly event: string;
	readonly arguments: T;
}

interface CompilationArguments {
	readonly files: Array<string>;
}
export interface CompilationEvent extends InputEvent<CompilationArguments> {}

export function isCompilationEvent(event: InputEvent): event is CompilationEvent {
	return event.event === "compile";
}

export function jsonReporter<K extends keyof RpcType>(request: K, value: RpcType[K]) {
	// eslint-disable-next-line no-console
	console.log(
		JSON.stringify({
			event: request,
			arguments: value,
		}),
	);

	return value;
}

function jsonDiagnostic(rootPath: string, diagnostic: ts.Diagnostic, lineAndCol?: LineAndCharacter) {
	if (typeof diagnostic.messageText === "object") {
		const data = jsonReporter("fileDiagnostic", {
			filePath: diagnostic.file ? path.relative(rootPath, diagnostic.file.fileName) : undefined,
			message: diagnostic.messageText.messageText,
			code: typeof diagnostic.code === "number" ? diagnostic.code : -1,
			category: diagnostic.category,
			position: diagnostic.start,
			source: diagnostic.source,
			line: lineAndCol?.line,
			column: lineAndCol?.character,
			length: diagnostic.length,
			text:
				diagnostic.start !== undefined && diagnostic.length !== undefined && diagnostic.file
					? diagnostic.file.text.substring(diagnostic.start, diagnostic.start + diagnostic.length)
					: undefined,
		});

		const root = diagnostic.messageText;
		if (root.next !== undefined) {
			const reportNextChain = (chain: Array<ts.DiagnosticMessageChain>) => {
				for (const item of chain) {
					jsonReporter("fileDiagnostic", {
						filePath: data.filePath,
						message: item.messageText,
						category: item.category,
						position: undefined,
						line: undefined,
						length: undefined,
						column: undefined,
						code: item.code,
						source: undefined,
						text: undefined,
					});

					if (item.next) {
						reportNextChain(item.next);
					}
				}
			};

			reportNextChain(root.next);
		}
	} else {
		jsonReporter("fileDiagnostic", {
			filePath: diagnostic.file ? path.relative(rootPath, diagnostic.file.fileName) : undefined,
			message: diagnostic.messageText,
			code: typeof diagnostic.code === "number" ? diagnostic.code : -1,
			category: diagnostic.category,
			position: diagnostic.start,
			source: diagnostic.source,
			line: lineAndCol?.line,
			column: lineAndCol?.character,
			length: diagnostic.length,
			text:
				diagnostic.start !== undefined && diagnostic.length !== undefined && diagnostic.file
					? diagnostic.file.text.substring(diagnostic.start, diagnostic.start + diagnostic.length)
					: undefined,
		});
	}
}

export function createJsonDiagnosticReporter(data: ProjectData): ts.DiagnosticReporter {
	return diagnostic => {
		const lineAndCol =
			diagnostic.start !== undefined
				? diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start)
				: undefined;

		const rootPath = path.dirname(data.projectOptions.package);
		jsonDiagnostic(rootPath, diagnostic, lineAndCol);
	};
}
