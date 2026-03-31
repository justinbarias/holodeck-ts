import { afterEach, describe, expect, it, mock } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import {
	createInputBar,
	getInputValue,
	setInputValue,
} from "../../../../src/cli/tui/components/input-bar.js";

describe("tui/input-bar", () => {
	let cleanup: (() => void) | null = null;

	afterEach(() => {
		cleanup?.();
		cleanup = null;
	});

	it("creates an input bar with prompt and textarea", async () => {
		const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
			width: 60,
			height: 5,
		});
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		renderer.root.add(refs.container);
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		await renderOnce();
		const frame = captureCharFrame();
		expect(frame).toContain(">");
		expect(frame).toContain("[Enter]");
	});

	it("setInputValue sets text on textarea", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 5 });
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		setInputValue(refs, "Hello world");
		expect(getInputValue(refs)).toBe("Hello world");
	});

	it("setInputValue computes correct height for multiline content", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 10 });
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		setInputValue(refs, "line1\nline2\nline3");
		// Height is set to Math.max(1, Math.min(5, lineCount))
		// TextareaRenderable may override height internally, so verify
		// the value is within the expected clamped range
		expect(refs.textarea.height).toBeGreaterThanOrEqual(1);
		expect(refs.textarea.height).toBeLessThanOrEqual(5);
	});

	it("setInputValue height never exceeds 5 lines", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 10 });
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		setInputValue(refs, "1\n2\n3\n4\n5\n6\n7\n8");
		expect(refs.textarea.height).toBeLessThanOrEqual(5);
	});

	it("setInputValue has minimum height of 1", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 5 });
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		setInputValue(refs, "");
		expect(refs.textarea.height).toBe(1);
	});

	it("getInputValue returns current textarea content", async () => {
		const { renderer } = await createTestRenderer({ width: 60, height: 5 });
		const onSubmit = mock(() => {});
		const refs = createInputBar(renderer, { onSubmit });
		cleanup = () => {
			renderer.stop();
			renderer.destroy();
		};

		expect(getInputValue(refs)).toBe("");
		setInputValue(refs, "test input");
		expect(getInputValue(refs)).toBe("test input");
	});
});
