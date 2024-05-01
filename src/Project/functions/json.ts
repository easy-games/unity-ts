// eslint-disable-next-line @typescript-eslint/ban-types

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

export function json<K extends keyof RpcType>(request: K, value: RpcType[K]) {
	// eslint-disable-next-line no-console
	console.log(
		"json:" +
			JSON.stringify({
				event: request,
				arguments: value,
			}),
	);
}
