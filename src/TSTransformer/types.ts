import { AirshipSymbolManager, MacroManager, RoactSymbolManager } from "TSTransformer";

export interface TransformServices {
	macroManager: MacroManager;
	airshipSymbolManager: AirshipSymbolManager;
	roactSymbolManager: RoactSymbolManager | undefined;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
