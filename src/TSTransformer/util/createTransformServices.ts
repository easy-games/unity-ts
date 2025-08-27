import { ProjectData } from "Shared/types";
import { AirshipSymbolManager, MacroManager, RoactSymbolManager } from "TSTransformer";
import { TransformServices } from "TSTransformer/types";
import ts from "typescript";

export function createTransformServices(
	program: ts.Program,
	typeChecker: ts.TypeChecker,
	data: ProjectData,
): TransformServices {
	const macroManager = new MacroManager(typeChecker, program);
	const airshipSymbolManager = new AirshipSymbolManager(typeChecker, macroManager);

	return { macroManager, roactSymbolManager: undefined, airshipSymbolManager };
}
