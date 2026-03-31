import { afterEach, describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createSidebar } from "../../../../src/cli/tui/components/sidebar.js";
import { ChatStore } from "../../../../src/cli/tui/state.js";

function createStore(
	overrides?: Partial<import("../../../../src/cli/tui/state.js").ChatStoreInit>,
) {
	return new ChatStore({
		agentName: "test-agent",
		modelName: "claude-sonnet-4-20250514",
		temperature: 0.5,
		tools: [],
		skills: [],
		...overrides,
	});
}

describe("tui/sidebar", () => {
	let cleanup: (() => void) | null = null;

	afterEach(() => {
		cleanup?.();
		cleanup = null;
	});

	it("renders agent name and model", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 20,
		});
		const store = createStore();
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain("test-agent");
		// Model name may be truncated by sidebar width
		expect(frame).toContain("claude-sonnet-");
	});

	it("renders tools section when tools are provided", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 30,
		});
		const store = createStore({
			tools: [
				{ name: "web_search", type: "mcp" },
				{ name: "knowledge_base", type: "hierarchical_document" },
			],
		});
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain("Tools");
		expect(frame).toContain("web_search");
		expect(frame).toContain("knowledge_base");
	});

	it("renders skills section when skills are provided", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 30,
		});
		const store = createStore({ skills: ["code-review", "summarize"] });
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain("Skills");
		expect(frame).toContain("code-review");
		expect(frame).toContain("summarize");
	});

	it("omits tools and skills sections when empty", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 20,
		});
		const store = createStore({ tools: [], skills: [] });
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).not.toContain("── Tools");
		expect(frame).not.toContain("── Skills");
	});

	it("updates turn count when user messages are added", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 20,
		});
		const store = createStore();
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		expect(captureCharFrame()).toContain("Turns: 0");

		store.addUserMessage("Hello");
		store.addUserMessage("World");
		await renderOnce();
		expect(captureCharFrame()).toContain("Turns: 2");
	});

	it("updates token count on state change", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 20,
		});
		const store = createStore();
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.updateSessionTokens(1500, 500);
		await renderOnce();
		expect(captureCharFrame()).toContain("Tokens: 1500");
	});

	it("displays context percentage when > 0", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 20,
		});
		const store = createStore();
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		store.updateContextPercentage(75);
		await renderOnce();
		expect(captureCharFrame()).toContain("Context: 75%");
	});

	it("renders keyboard shortcuts section", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 40,
			height: 30,
		});
		const store = createStore();
		const refs = createSidebar(renderer, store);
		renderer.root.add(refs.container);
		cleanup = () => {
			refs.dispose();
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain("Keys");
	});
});
