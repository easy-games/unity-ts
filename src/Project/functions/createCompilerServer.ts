/* eslint-disable @typescript-eslint/no-unused-vars */
import { LogService } from "Shared/classes/LogService";
import { EventEmitter } from "stream";
import ts from "typescript";
import { WebSocket, WebSocketServer } from "ws";

interface Event<T extends string = string> {
	eventName: T;
}

interface CompiledFilesEvent extends Event<"compiledFile"> {
	fileNames: ReadonlyArray<string>;
}

interface CompletedCompileWithErrorsEvent extends Event<"completedCompileWithErrors"> {
	errorCount: number;
}

interface SendEvents {
	// compiledFile: CompiledFileEvent;
	compiledFiles: CompiledFilesEvent;
	completedCompliationWithErrors: CompletedCompileWithErrorsEvent;
	completedCompilation: Event<"completedCompile">;
}
interface ReceiveEvents {
	requestCompile: Event<"requestCompile">;
}

interface RequestCompileEvent extends Event<"requestCompile"> {}

function isEvent(value: any): value is Event {
	return typeof value === "object" && "eventName" in value;
}

export class AirshipTypescriptCompilerServer {
	private clients = new Array<WebSocket>();
	private events = new EventEmitter();
	private fileCompileQueue = new Array<string>();

	public constructor(public readonly websocket: WebSocketServer) {

	}
	public start() {
		this.websocket.on("connection", (ws, msg) => {
			this.clients.push(ws);
			LogService.writeLineIfVerbose("Client connected to WebSocket", `${this.clients.length} clients`);

			ws.on("message", (data, isBinary) => {
				LogService.writeLineIfVerbose("Received data from client", data);
				const rawData = data.toString("utf8");
				const dataJson = JSON.parse(rawData) as object | undefined;
				if (isEvent(dataJson)) {
					this.events.emit(dataJson.eventName, dataJson);
				}
			});

			ws.on("close", (code, reason) => {
				this.clients.splice(this.clients.indexOf(ws));
				LogService.writeLineIfVerbose(
					"Client disconnected from WebSocket",
					reason.toString(),
					`${this.clients.length} clients`,
				);
			});
		});

		setInterval(() => {
			if (this.fileCompileQueue.length > 0) {
				console.log("pushQueue", this.fileCompileQueue.length)
				this.invoke("compiledFiles", { fileNames: this.fileCompileQueue });
				this.fileCompileQueue = [];
			}
		}, 10);
	}

	private sendMessage(message: string) {
		this.clients.forEach(client => {
			client.send(message);
		});
	}

	public invoke<K extends keyof SendEvents>(key: K, value: Omit<SendEvents[K], "eventName">) {
		const eventData = {
			eventName: key,
			...value,
		};

		this.sendMessage(JSON.stringify(eventData) + "\0");
	}

	public pushCompiledFile(sourceFile: ts.SourceFile) {
		this.fileCompileQueue.push(sourceFile.fileName);
	}

	public on<K extends keyof ReceiveEvents>(name: K, cb: (event: ReceiveEvents[K]) => void): this;
	public on(event: string, cb: (...args: any[]) => void) {
		this.events.on(event, cb);
		return this;
	}
}

let compilerServer: AirshipTypescriptCompilerServer | undefined;
export function createCompilerServer(): AirshipTypescriptCompilerServer {
	const server = new WebSocketServer({ port: 7472 });
	compilerServer = new AirshipTypescriptCompilerServer(server);
	return compilerServer;
}

export function getCompilerServer() {
	return compilerServer;
}
