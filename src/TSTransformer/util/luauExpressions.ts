import luau from "@roblox-ts/luau-ast";

export function createLuauVariableDeclaration(
	left: luau.AnyIdentifier | luau.List<luau.AnyIdentifier>,
	right: luau.Expression<luau.SyntaxKind> | luau.List<luau.Expression<luau.SyntaxKind>> | undefined,
) {
	return luau.create(luau.SyntaxKind.VariableDeclaration, {
		left,
		right,
	});
}

export function createLuauForStatement(
	ids: luau.List<luau.AnyIdentifier>,
	expression: luau.Expression<luau.SyntaxKind>,
	statements: luau.List<luau.Statement<luau.SyntaxKind>>,
) {
	return luau.create(luau.SyntaxKind.ForStatement, {
		expression,
		statements,
		ids,
	});
}

export function createLuauIfStatement(
	condition: luau.Expression<luau.SyntaxKind>,
	ifTrue: luau.List<luau.Statement>,
	ifFalse: luau.IfStatement | luau.List<luau.Statement<luau.SyntaxKind>> = luau.list.make(),
) {
	return luau.create(luau.SyntaxKind.IfStatement, {
		statements: ifTrue,
		condition,
		elseBody: ifFalse,
	});
}
