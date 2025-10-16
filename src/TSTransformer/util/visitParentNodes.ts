import ts from "typescript";

function* visitParentNodes(node: ts.Node) {
	let current = node.parent;

	do {
		yield current;
		current = current.parent;
	} while (current);
}

export function findAncestorNode<T extends ts.Node>(
	node: ts.Node,
	getNode: (value: ts.Node) => value is T,
	breakAtNode?: (value: ts.Node) => boolean,
) {
	// if (getNode(node)) return node;

	for (const parentNode of visitParentNodes(node)) {
		if (breakAtNode?.(parentNode)) break;
		if (getNode(parentNode)) return parentNode;
	}

	return undefined;
}
