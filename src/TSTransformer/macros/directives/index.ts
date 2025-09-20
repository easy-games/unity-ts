export { isClientIfDirective, isServerIfDirective } from "TSTransformer/macros/directives/checkDirectives";
export {
	isGuardClause,
	isInverseGuardClause,
	transformDirectiveIfStatement,
} from "TSTransformer/macros/directives/transformDirectives";

export enum CompilerDirective {
	SERVER,
	NOT_SERVER,
	CLIENT,
	NOT_CLIENT,
}
