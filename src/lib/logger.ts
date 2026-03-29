export const logger = {
	info: (msg: string, ...args: unknown[]): void => {
		console.info(`[holodeck] ${msg}`, ...args);
	},
	warn: (msg: string, ...args: unknown[]): void => {
		console.warn(`[holodeck] ${msg}`, ...args);
	},
	error: (msg: string, ...args: unknown[]): void => {
		console.error(`[holodeck] ${msg}`, ...args);
	},
	debug: (msg: string, ...args: unknown[]): void => {
		if (process.env.DEBUG) {
			console.debug(`[holodeck] ${msg}`, ...args);
		}
	},
};
