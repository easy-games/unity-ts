import luau from "@roblox-ts/luau-ast";

const globals = {
	...luau.globals,
	game: undefined,
};

delete globals.game; // IDK why LuauAST includes this

export function isReservedIdentifier(id: string) {
	return Object.prototype.hasOwnProperty.call(globals, id);
}
