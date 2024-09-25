import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => luau.Expression;

export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => luau.Expression;

export type CallMacro = (
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export type CallDecoratorMacro = (
	state: TransformState,
	decorator: ts.Decorator,
	node: ts.ClassLikeDeclaration | ts.MethodDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration,
) => luau.Statement<luau.SyntaxKind> | undefined;

export type PropertyCallMacro = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export type PropertySetMacro = (
	state: TransformState,
	node: ts.PropertyAccessExpression,
	value: luau.Expression,
) => luau.List<luau.Statement>;
export type PropertyGetMacro = (state: TransformState, node: ts.PropertyAccessExpression) => luau.Expression;
