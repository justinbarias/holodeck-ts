export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-enum": [2, "always", ["cli", "config", "agent", "tools", "eval", "otel", "lib", "deps"]],
		"scope-empty": [1, "never"],
	},
};
