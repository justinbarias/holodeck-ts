import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolError } from "../../../../src/lib/errors.js";
import {
	discoverFiles,
	SUPPORTED_EXTENSIONS,
} from "../../../../src/tools/vectorstore/discovery.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testDir: string;

beforeAll(() => {
	testDir = join(tmpdir(), `holodeck-discovery-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });

	// Supported files
	writeFileSync(join(testDir, "readme.md"), "# README");
	writeFileSync(join(testDir, "notes.txt"), "Some notes");
	writeFileSync(join(testDir, "page.html"), "<html></html>");
	writeFileSync(join(testDir, "index.htm"), "<html></html>");
	writeFileSync(join(testDir, "document.docx"), "fake docx bytes");
	writeFileSync(join(testDir, "report.pdf"), "fake pdf bytes");

	// Unsupported files
	writeFileSync(join(testDir, "script.js"), 'console.log("hi")');
	writeFileSync(join(testDir, "data.json"), "{}");
	writeFileSync(join(testDir, "image.png"), "fake png bytes");

	// Nested supported file
	mkdirSync(join(testDir, "subdir"), { recursive: true });
	writeFileSync(join(testDir, "subdir", "nested.md"), "# Nested");
});

afterAll(() => {
	rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SUPPORTED_EXTENSIONS", () => {
	it("includes all expected extensions", () => {
		expect(SUPPORTED_EXTENSIONS.has(".md")).toBe(true);
		expect(SUPPORTED_EXTENSIONS.has(".txt")).toBe(true);
		expect(SUPPORTED_EXTENSIONS.has(".html")).toBe(true);
		expect(SUPPORTED_EXTENSIONS.has(".htm")).toBe(true);
		expect(SUPPORTED_EXTENSIONS.has(".docx")).toBe(true);
		expect(SUPPORTED_EXTENSIONS.has(".pdf")).toBe(true);
	});

	it("does not include unsupported extensions", () => {
		expect(SUPPORTED_EXTENSIONS.has(".js")).toBe(false);
		expect(SUPPORTED_EXTENSIONS.has(".json")).toBe(false);
		expect(SUPPORTED_EXTENSIONS.has(".png")).toBe(false);
		expect(SUPPORTED_EXTENSIONS.has(".ts")).toBe(false);
	});
});

describe("discoverFiles", () => {
	describe("glob expansion", () => {
		it("discovers all supported files in a directory", async () => {
			const files = await discoverFiles(testDir);

			// Should find all 7 supported files (6 root + 1 nested)
			expect(files.length).toBe(7);

			// Each result includes a path, extension, and modifiedAt
			for (const file of files) {
				expect(typeof file.path).toBe("string");
				expect(typeof file.extension).toBe("string");
				expect(file.modifiedAt).toBeInstanceOf(Date);
			}
		});

		it("discovers nested files recursively", async () => {
			const files = await discoverFiles(testDir);
			const paths = files.map((f) => f.path);
			const nested = paths.find((p) => p.includes("subdir"));
			expect(nested).toBeDefined();
		});
	});

	describe("extension filtering", () => {
		it("only returns files with supported extensions", async () => {
			const files = await discoverFiles(testDir);
			for (const file of files) {
				expect(SUPPORTED_EXTENSIONS.has(file.extension)).toBe(true);
			}
		});

		it("populates extension field correctly", async () => {
			const files = await discoverFiles(testDir);
			const mdFile = files.find((f) => f.path.endsWith("readme.md"));
			expect(mdFile?.extension).toBe(".md");

			const txtFile = files.find((f) => f.path.endsWith("notes.txt"));
			expect(txtFile?.extension).toBe(".txt");

			const htmlFile = files.find((f) => f.path.endsWith("page.html"));
			expect(htmlFile?.extension).toBe(".html");
		});

		it("skips .js, .json, .png files", async () => {
			const files = await discoverFiles(testDir);
			const paths = files.map((f) => f.path);
			expect(paths.some((p) => p.endsWith(".js"))).toBe(false);
			expect(paths.some((p) => p.endsWith(".json"))).toBe(false);
			expect(paths.some((p) => p.endsWith(".png"))).toBe(false);
		});
	});

	describe("modifiedAt tracking", () => {
		it("sets modifiedAt as a Date", async () => {
			const files = await discoverFiles(testDir);
			for (const file of files) {
				expect(file.modifiedAt).toBeInstanceOf(Date);
				expect(Number.isFinite(file.modifiedAt.getTime())).toBe(true);
			}
		});

		it("modifiedAt is a recent timestamp", async () => {
			const files = await discoverFiles(testDir);
			const now = Date.now();
			for (const file of files) {
				// Files were just created, so mtime should be within the last 60 seconds
				const diff = now - file.modifiedAt.getTime();
				expect(diff).toBeLessThan(60_000);
			}
		});
	});

	describe("error cases", () => {
		it("throws ToolError when directory is empty", async () => {
			const emptyDir = join(tmpdir(), `holodeck-empty-${Date.now()}`);
			mkdirSync(emptyDir, { recursive: true });
			try {
				await expect(discoverFiles(emptyDir)).rejects.toThrow(ToolError);
			} finally {
				rmSync(emptyDir, { recursive: true, force: true });
			}
		});

		it("throws ToolError with message containing source path when empty", async () => {
			const emptyDir = join(tmpdir(), `holodeck-empty-msg-${Date.now()}`);
			mkdirSync(emptyDir, { recursive: true });
			try {
				let caught: unknown;
				try {
					await discoverFiles(emptyDir);
				} catch (err) {
					caught = err;
				}
				expect(caught).toBeInstanceOf(ToolError);
				expect((caught as ToolError).message).toContain(emptyDir);
			} finally {
				rmSync(emptyDir, { recursive: true, force: true });
			}
		});

		it("throws ToolError when directory contains only unsupported files", async () => {
			const unsupportedDir = join(tmpdir(), `holodeck-unsupported-${Date.now()}`);
			mkdirSync(unsupportedDir, { recursive: true });
			writeFileSync(join(unsupportedDir, "script.js"), "// js");
			writeFileSync(join(unsupportedDir, "data.json"), "{}");
			writeFileSync(join(unsupportedDir, "image.png"), "png");
			try {
				await expect(discoverFiles(unsupportedDir)).rejects.toThrow(ToolError);
			} finally {
				rmSync(unsupportedDir, { recursive: true, force: true });
			}
		});

		it("ToolError has operation set to discoverFiles", async () => {
			const emptyDir = join(tmpdir(), `holodeck-op-${Date.now()}`);
			mkdirSync(emptyDir, { recursive: true });
			try {
				let caught: unknown;
				try {
					await discoverFiles(emptyDir);
				} catch (err) {
					caught = err;
				}
				expect(caught).toBeInstanceOf(ToolError);
				expect((caught as ToolError).operation).toBe("discoverFiles");
			} finally {
				rmSync(emptyDir, { recursive: true, force: true });
			}
		});

		it("throws ToolError with 'no documents found' message", async () => {
			const emptyDir = join(tmpdir(), `holodeck-msg2-${Date.now()}`);
			mkdirSync(emptyDir, { recursive: true });
			try {
				let caught: unknown;
				try {
					await discoverFiles(emptyDir);
				} catch (err) {
					caught = err;
				}
				expect(caught).toBeInstanceOf(ToolError);
				expect((caught as ToolError).message).toContain("no documents found");
			} finally {
				rmSync(emptyDir, { recursive: true, force: true });
			}
		});
	});
});
