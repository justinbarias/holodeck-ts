import { RGBA } from "@opentui/core";

// Brand colors
export const CYAN = RGBA.fromHex("#00E5FF");
export const PURPLE = RGBA.fromHex("#B388FF");
export const DARK_BG = RGBA.fromHex("#0D1117");
export const SURFACE = RGBA.fromHex("#161B22");
export const BORDER = RGBA.fromHex("#30363D");
export const TEXT_PRIMARY = RGBA.fromHex("#E6EDF3");
export const TEXT_SECONDARY = RGBA.fromHex("#8B949E");
export const TEXT_DIM = RGBA.fromHex("#484F58");
export const ERROR_RED = RGBA.fromHex("#F85149");
export const WARNING_YELLOW = RGBA.fromHex("#D29922");
export const SUCCESS_GREEN = RGBA.fromHex("#3FB950");

// Semantic aliases
export const USER_COLOR = CYAN;
export const AGENT_COLOR = PURPLE;
export const TOOL_COLOR = WARNING_YELLOW;

// Braille spinner frames for tool status
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
