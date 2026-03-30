declare module "marked-terminal" {
	export interface TerminalRendererOptions {
		reflowText?: boolean;
		width?: number;
		emoji?: boolean;
	}

	export default class TerminalRenderer {
		constructor(options?: TerminalRendererOptions);
	}
}
