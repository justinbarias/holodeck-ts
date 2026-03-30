export const VERSION = "0.1.0";

export type { ChatSession } from "./agent/session.js";
export {
	closeSession,
	createChatSession,
	interruptResponse,
	sendMessage,
} from "./agent/session.js";
export type { ChatEvent, SessionState, StreamContext } from "./agent/streaming.js";
export { mapSDKMessages } from "./agent/streaming.js";
export { loadAgentConfig } from "./config/loader.js";
export type { AgentConfig } from "./config/schema.js";
export {
	ConfigError,
	HoloDeckError,
	HoloDeckEvalError,
	ToolError,
	toErrorMessage,
} from "./lib/errors.js";
