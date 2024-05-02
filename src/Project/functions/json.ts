// eslint-disable-next-line @typescript-eslint/ban-types

import { ProjectData } from "Shared/types";
import path from "path";
import ts, { DiagnosticMessageChain } from "typescript";

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

interface CompiledFile {}

interface StartCompile {
	initial: boolean;
}
interface FinishCompile {}

interface RpcType {
	watchReport: WatchReport;
	fileDiagnostic: EditorFileDiagnostic;
	compiledFile: CompiledFile;
	transformFile: CompiledFile;
	startingCompile: StartCompile;
	finishedCompile: FinishCompile;
	finishedCompileWithErrors: FinishCompile & { errorCount: number };
}

export function jsonReporter<K extends keyof RpcType>(request: K, value: RpcType[K]) {
	// eslint-disable-next-line no-console
	console.log(
		JSON.stringify({
			event: request,
			arguments: value,
		}),
	);
}

export function createJsonDiagnosticReporter(data: ProjectData): ts.DiagnosticReporter {
	return diagnostic => {
		const lineAndCol =
			diagnostic.start !== undefined
				? diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start)
				: undefined;

		jsonReporter("fileDiagnostic", {
			filePath: diagnostic.file ? path.relative(data.projectPath, diagnostic.file.fileName) : undefined,
			message: diagnostic.messageText,
			code: diagnostic.code,
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
	};
}
