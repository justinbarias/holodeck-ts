import { afterEach, describe, expect, it } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createStatusBar, formatElapsed } from "../../../../src/cli/tui/components/status-bar.js";
import { ChatStore } from "../../../../src/cli/tui/state.js";

function createStore() {
	return new ChatStore({
		agentName: "test",
		modelName: "claude-sonnet-4-20250514",
		temperature: 0.3,
		tools: [],
		skills: [],
	});
}

describe("tui/status-bar", () => {
	describe("formatElapsed", () => {
		it("formats elapsed seconds with one decimal", () => {
			const startedAt = new Date(Date.now() - 5000);
			const result = formatElapsed(startedAt);
			expect(result).toMatch(/^\d+\.\ds$/);
			const num = Number.parseFloat(result);
			expect(num).toBeGreaterThanOrEqual(4.9);
			expect(num).toBeLessThanOrEqual(5.2);
		});

		it("handles zero elapsed time", () => {
			const result = formatElapsed(new Date());
			expect(result).toMatch(/^0\.\ds$/);
		});

		it("handles large elapsed times", () => {
			const startedAt = new Date(Date.now() - 120_000);
			const result = formatElapsed(startedAt);
			const num = Number.parseFloat(result);
			expect(num).toBeGreaterThanOrEqual(119);
			expect(num).toBeLessThanOrEqual(121);
		});
	});

	describe("createStatusBar", () => {
		let cleanup: (() => void) | null = null;

		afterEach(() => {
			cleanup?.();
			cleanup = null;
		});

		it("creates a status bar that renders", async () => {
			const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);
			cleanup = () => {
				refs.dispose();
				renderer.stop();
				renderer.destroy();
			};

			await renderOnce();
			const frame = captureCharFrame();
			// Empty status bar should render (just whitespace)
			expect(frame).toBeDefined();
		});

		it("shows tool name when a tool is active", async () => {
			const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);
			cleanup = () => {
				refs.dispose();
				renderer.stop();
				renderer.destroy();
			};

			store.setActiveToolCall("web_search");
			await renderOnce();
			const frame = captureCharFrame();
			expect(frame).toContain("web_search");
		});

		it("shows compaction message during compaction", async () => {
			const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);
			cleanup = () => {
				refs.dispose();
				renderer.stop();
				renderer.destroy();
			};

			store.startCompaction();
			await renderOnce();
			const frame = captureCharFrame();
			expect(frame).toContain("Compacting");
		});

		it("shows error status message", async () => {
			const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);
			cleanup = () => {
				refs.dispose();
				renderer.stop();
				renderer.destroy();
			};

			store.setError("Connection lost");
			await renderOnce();
			const frame = captureCharFrame();
			expect(frame).toContain("Connection lost");
		});

		it("shows context percentage when > 0", async () => {
			const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);
			cleanup = () => {
				refs.dispose();
				renderer.stop();
				renderer.destroy();
			};

			store.updateContextPercentage(65);
			await renderOnce();
			const frame = captureCharFrame();
			expect(frame).toContain("Context: 65%");
		});

		it("dispose cleans up subscription and animation timers", async () => {
			const { renderer, renderOnce } = await createTestRenderer({
				width: 80,
				height: 3,
			});
			const store = createStore();
			const refs = createStatusBar(renderer, store);
			renderer.root.add(refs.container);

			store.setActiveToolCall("Read");
			await renderOnce();

			refs.dispose();
			renderer.stop();
			renderer.destroy();

			// After dispose, store updates should not throw
			store.clearActiveToolCall("Read", "done");
		});
	});
});
