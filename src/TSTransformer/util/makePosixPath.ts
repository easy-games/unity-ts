export function makePosixPath(p: string): string {
	if (p.includes("/")) {
		return p;
	}
	return p.split("\\").join("/");
}
