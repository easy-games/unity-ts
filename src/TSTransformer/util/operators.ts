import ts from "typescript";

export function isEqualityOperator(operator: ts.BinaryOperator) {
	if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
		return true;
	}

	return false;
}
