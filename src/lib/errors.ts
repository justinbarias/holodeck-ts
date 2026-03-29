export class HoloDeckError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HoloDeckError";
	}
}

export class ConfigError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConfigError";
	}
}

export class ToolError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ToolError";
	}
}

export class HoloDeckEvalError extends HoloDeckError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "HoloDeckEvalError";
	}
}
