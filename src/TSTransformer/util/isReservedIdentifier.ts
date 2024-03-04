import luau from "@roblox-ts/luau-ast";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { game, ...globals } = luau.globals;

export function isReservedIdentifier(id: string) {
	return Object.prototype.hasOwnProperty.call(globals, id);
}
