export function resolveEnvVars(input: string): string {
	return input.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
		return process.env[name] ?? "";
	});
}
