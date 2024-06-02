import ts from "typescript";

export interface FlameworkClassInfo {
	symbol: ts.Symbol;
	internalId: string;
	node: ts.Node;
	name: string;
	decorators: Array<FlameworkDecoratorInfo>;
}

interface BaseDecorator<T extends string = "Base"> {
	type: T;
	name: string;
	internalId: string;
	isFlameworkDecorator: boolean;
}

interface DecoratorWithNodes extends BaseDecorator<"WithNodes"> {
	symbol: ts.Symbol;
	declaration: ts.Node;
	arguments: ts.Node[];
}

interface ServiceDecorator extends BaseDecorator {
	name: "Service";
}

interface ControllerDecorator extends BaseDecorator {
	name: "Controller";
}

interface SingletonDecorator extends BaseDecorator {
	name: "Singleton";
}

export type FlameworkDecoratorInfo = DecoratorWithNodes | ServiceDecorator | ControllerDecorator | SingletonDecorator;
