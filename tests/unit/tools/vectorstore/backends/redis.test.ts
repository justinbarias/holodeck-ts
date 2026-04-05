import { beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock redis
// ---------------------------------------------------------------------------

const mockConnect = mock();
const mockQuit = mock();
const mockOn = mock();
const mockInfo = mock();
const mockHGet = mock();
const mockHSet = mock();
const mockFtInfo = mock();
const mockFtCreate = mock();
const mockFtSearch = mock();
const mockFtHybrid = mock();
const mockExec = mock();

// Pipeline mock: each chainable method returns the pipeline itself
function makePipeline() {
	const pipeline: Record<string, unknown> = {};
	const mockPipelineHSet = mock(() => pipeline);
	const mockPipelineHGetAll = mock(() => pipeline);
	const mockPipelineDel = mock(() => pipeline);
	pipeline.hSet = mockPipelineHSet;
	pipeline.hGetAll = mockPipelineHGetAll;
	pipeline.del = mockPipelineDel;
	pipeline.exec = mockExec;
	return { pipeline, mockPipelineHSet, mockPipelineHGetAll, mockPipelineDel };
}

const defaultPipeline = makePipeline();

mock.module("redis", () => ({
	createClient: () => ({
		connect: mockConnect,
		quit: mockQuit,
		on: mockOn,
		info: mockInfo,
		hGet: mockHGet,
		hSet: mockHSet,
		ft: {
			info: mockFtInfo,
			create: mockFtCreate,
			search: mockFtSearch,
			hybrid: mockFtHybrid,
		},
		multi: () => defaultPipeline.pipeline,
	}),
}));

// Import AFTER mock.module
import {
	RedisSearchBackend,
	RedisVectorBackend,
} from "../../../../../src/tools/vectorstore/backends/redis.js";
import type { IndexableDocument } from "../../../../../src/tools/vectorstore/backends/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVectorBackend() {
	return new RedisVectorBackend({
		connectionString: "redis://localhost:6379",
		indexName: "test_idx",
		dimensions: 3,
	});
}

function makeDoc(overrides?: Partial<IndexableDocument>): IndexableDocument {
	return {
		id: "doc-1",
		content: "hello world",
		embedding: [0.1, 0.2, 0.3],
		metadata: { source: "test" },
		...overrides,
	};
}

async function initVectorBackend(backend: RedisVectorBackend, redisVersion = "8.4.0") {
	mockConnect.mockResolvedValueOnce(undefined);
	mockInfo.mockResolvedValueOnce(`# Server\r\nredis_version:${redisVersion}\r\n`);
	mockFtInfo.mockRejectedValueOnce(new Error("Unknown index")); // index doesn't exist
	mockFtCreate.mockResolvedValueOnce("OK");
	await backend.initialize();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RedisVectorBackend", () => {
	beforeEach(() => {
		mockConnect.mockClear();
		mockQuit.mockClear();
		mockOn.mockClear();
		mockInfo.mockClear();
		mockHGet.mockClear();
		mockHSet.mockClear();
		mockFtInfo.mockClear();
		mockFtCreate.mockClear();
		mockFtSearch.mockClear();
		mockFtHybrid.mockClear();
		mockExec.mockClear();
		defaultPipeline.mockPipelineHSet.mockClear();
		defaultPipeline.mockPipelineHGetAll.mockClear();
		defaultPipeline.mockPipelineDel.mockClear();
	});

	// -----------------------------------------------------------------------
	// getClient before connect
	// -----------------------------------------------------------------------

	it("getClient() throws before initialize()", () => {
		const backend = makeVectorBackend();
		expect(() => backend.getClient()).toThrow(/not been initialized/);
	});

	// -----------------------------------------------------------------------
	// Version detection
	// -----------------------------------------------------------------------

	describe("version detection", () => {
		it("detects Redis 8.4+ and enables nativeHybrid", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "8.4.0");
			expect(backend.supportsNativeHybrid()).toBe(true);
		});

		it("detects Redis 9.0 and enables nativeHybrid", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "9.0.1");
			expect(backend.supportsNativeHybrid()).toBe(true);
		});

		it("detects Redis 7.2 and disables nativeHybrid", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "7.2.5");
			expect(backend.supportsNativeHybrid()).toBe(false);
		});

		it("detects Redis 8.3 and disables nativeHybrid", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "8.3.9");
			expect(backend.supportsNativeHybrid()).toBe(false);
		});

		it("defaults to nativeHybrid=false on INFO failure", async () => {
			const backend = makeVectorBackend();
			mockConnect.mockResolvedValueOnce(undefined);
			mockInfo.mockRejectedValueOnce(new Error("ERR"));
			mockFtInfo.mockRejectedValueOnce(new Error("Unknown index"));
			mockFtCreate.mockResolvedValueOnce("OK");
			await backend.initialize();
			expect(backend.supportsNativeHybrid()).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Index creation
	// -----------------------------------------------------------------------

	describe("index creation", () => {
		it("creates HNSW index when ft.info throws (index absent)", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			expect(mockFtCreate).toHaveBeenCalledTimes(1);
			const [indexName, schema, options] = mockFtCreate.mock.calls[0] ?? [];
			expect(indexName).toBe("test_idx");
			expect(schema.embedding.type).toBe("VECTOR");
			expect(schema.embedding.ALGORITHM).toBe("HNSW");
			expect(schema.embedding.DIM).toBe(3);
			expect(schema.embedding.DISTANCE_METRIC).toBe("COSINE");
			expect(options.ON).toBe("HASH");
			expect(options.PREFIX).toBe("test_idx:");
		});

		it("skips creation when ft.info succeeds (index exists)", async () => {
			const backend = makeVectorBackend();
			mockConnect.mockResolvedValueOnce(undefined);
			mockInfo.mockResolvedValueOnce("# Server\r\nredis_version:8.4.0\r\n");
			mockFtInfo.mockResolvedValueOnce({ numDocs: 100 }); // index exists
			await backend.initialize();

			expect(mockFtCreate).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// search — score normalization
	// -----------------------------------------------------------------------

	describe("search()", () => {
		it("converts COSINE distance to similarity [0,1]", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockFtSearch.mockResolvedValueOnce({
				documents: [
					{ id: "test_idx:a", value: { __score: "0" } },
					{ id: "test_idx:b", value: { __score: "1" } },
					{ id: "test_idx:c", value: { __score: "2" } },
				],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits[0]).toEqual({ id: "a", score: 1.0 }); // distance 0 → score 1
			expect(hits[1]).toEqual({ id: "b", score: 0.5 }); // distance 1 → score 0.5
			expect(hits[2]).toEqual({ id: "c", score: 0.0 }); // distance 2 → score 0
		});

		it("clamps scores to [0,1]", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockFtSearch.mockResolvedValueOnce({
				documents: [
					{ id: "test_idx:a", value: { __score: "-0.5" } }, // would give > 1
					{ id: "test_idx:b", value: { __score: "3" } }, // would give < 0
				],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits[0]?.score).toBe(1.0); // clamped
			expect(hits[1]?.score).toBe(0.0); // clamped
		});

		it("strips key prefix from document IDs", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockFtSearch.mockResolvedValueOnce({
				documents: [{ id: "test_idx:my-doc-id", value: { __score: "0.5" } }],
			});

			const hits = await backend.search([0.1, 0.2, 0.3], 1);
			expect(hits[0]?.id).toBe("my-doc-id");
		});

		it("constructs correct KNN query with DIALECT 2", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockFtSearch.mockResolvedValueOnce({ documents: [] });

			await backend.search([0.1, 0.2, 0.3], 7);

			const [indexName, query, options] = mockFtSearch.mock.calls[0] ?? [];
			expect(indexName).toBe("test_idx");
			expect(query).toBe("*=>[KNN 7 @embedding $BLOB AS __score]");
			expect(options.DIALECT).toBe(2);
			expect(options.SORTBY).toEqual({ BY: "__score", DIRECTION: "ASC" });
			expect(options.LIMIT).toEqual({ from: 0, size: 7 });
			// BLOB param should be a Buffer (Float32Array backing)
			expect(options.PARAMS.BLOB).toBeInstanceOf(Buffer);
			expect(options.PARAMS.BLOB.byteLength).toBe(3 * 4); // 3 floats × 4 bytes
		});

		it("wraps errors in ToolError", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockFtSearch.mockRejectedValueOnce(new Error("timeout"));

			await expect(backend.search([0.1, 0.2, 0.3], 5)).rejects.toThrow(
				/Redis vector search failed/,
			);
		});
	});

	// -----------------------------------------------------------------------
	// upsert
	// -----------------------------------------------------------------------

	describe("upsert()", () => {
		it("uses multi/exec pipeline with correct data", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockExec.mockResolvedValueOnce([]);

			await backend.upsert([makeDoc({ id: "d1", embedding: [1, 0, 0], metadata: { k: "v" } })]);

			expect(defaultPipeline.mockPipelineHSet).toHaveBeenCalledTimes(1);
			const args = (defaultPipeline.mockPipelineHSet.mock.calls as unknown[][])[0] as
				| [string, Record<string, unknown>]
				| undefined;
			const [key, fields] = args ?? ["", {}];
			expect(key).toBe("test_idx:d1");
			expect(fields.id).toBe("d1");
			expect(fields.content).toBe("hello world");
			expect(fields.metadata).toBe('{"k":"v"}');
			// Embedding should be a Buffer (Float32Array)
			expect(fields.embedding).toBeInstanceOf(Buffer);
			expect((fields.embedding as Buffer).byteLength).toBe(3 * 4);
			expect(mockExec).toHaveBeenCalledTimes(1);
		});

		it("is a no-op for empty docs", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			await backend.upsert([]);
			expect(defaultPipeline.mockPipelineHSet).not.toHaveBeenCalled();
			expect(mockExec).not.toHaveBeenCalled();
		});

		it("wraps errors in ToolError", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockExec.mockRejectedValueOnce(new Error("OOM"));

			await expect(backend.upsert([makeDoc()])).rejects.toThrow(/Redis upsert failed/);
		});
	});

	// -----------------------------------------------------------------------
	// retrieve
	// -----------------------------------------------------------------------

	describe("retrieve()", () => {
		it("parses JSON metadata from hash fields", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockExec.mockResolvedValueOnce([{ content: "hello", metadata: '{"source":"test"}' }]);

			const result = await backend.retrieve(["d1"]);
			expect(result.size).toBe(1);
			expect(result.get("d1")).toEqual({
				id: "d1",
				content: "hello",
				metadata: { source: "test" },
			});
		});

		it("skips entries without content", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockExec.mockResolvedValueOnce([null, { content: "present", metadata: "{}" }]);

			const result = await backend.retrieve(["missing", "found"]);
			expect(result.size).toBe(1);
			expect(result.has("missing")).toBe(false);
			expect(result.has("found")).toBe(true);
		});

		it("defaults missing metadata to empty object", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockExec.mockResolvedValueOnce([
				{ content: "hello" }, // no metadata field
			]);

			const result = await backend.retrieve(["d1"]);
			expect(result.get("d1")?.metadata).toEqual({});
		});

		it("returns empty Map for empty ids", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			const result = await backend.retrieve([]);
			expect(result.size).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete()", () => {
		it("prefixes IDs and uses pipeline", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockExec.mockResolvedValueOnce([]);

			await backend.delete(["a", "b"]);

			expect(defaultPipeline.mockPipelineDel).toHaveBeenCalledTimes(2);
			const delCalls = defaultPipeline.mockPipelineDel.mock.calls as unknown[][];
			expect(delCalls[0]?.[0]).toBe("test_idx:a");
			expect(delCalls[1]?.[0]).toBe("test_idx:b");
		});

		it("is a no-op for empty ids", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			await backend.delete([]);
			expect(defaultPipeline.mockPipelineDel).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// getManifest / setManifest
	// -----------------------------------------------------------------------

	describe("getManifest()", () => {
		it("returns stored value", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockHGet.mockResolvedValueOnce("stored-value");

			const val = await backend.getManifest("key");
			expect(val).toBe("stored-value");
			expect(mockHGet).toHaveBeenCalledWith("__holodeck_meta__", "key");
		});

		it("returns null when key not found", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockHGet.mockResolvedValueOnce(undefined);

			const val = await backend.getManifest("missing");
			expect(val).toBeNull();
		});
	});

	describe("setManifest()", () => {
		it("writes to __holodeck_meta__ hash", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);

			mockHSet.mockResolvedValueOnce(1);

			await backend.setManifest("key", "value");
			expect(mockHSet).toHaveBeenCalledWith("__holodeck_meta__", "key", "value");
		});
	});

	// -----------------------------------------------------------------------
	// close
	// -----------------------------------------------------------------------

	describe("close()", () => {
		it("calls quit on client", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend);
			mockQuit.mockResolvedValueOnce(undefined);

			await backend.close();
			expect(mockQuit).toHaveBeenCalledTimes(1);
		});
	});

	// -----------------------------------------------------------------------
	// connect error
	// -----------------------------------------------------------------------

	it("wraps connect failure in ToolError", async () => {
		const backend = makeVectorBackend();
		mockConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

		await expect(backend.initialize()).rejects.toThrow(/Failed to connect to Redis/);
	});

	// -----------------------------------------------------------------------
	// hybridSearch
	// -----------------------------------------------------------------------

	describe("hybridSearch()", () => {
		it("normalizes vector distance and BM25 text scores", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "8.4.0");

			mockFtHybrid.mockResolvedValueOnce({
				results: [
					{
						id: "test_idx:a",
						__vector_score: "0", // distance 0 → similarity 1.0
						__text_score: "10", // max → normalized 1.0
						__hybrid_score: "0.95",
					},
					{
						id: "test_idx:b",
						__vector_score: "1", // distance 1 → similarity 0.5
						__text_score: "5", // half of max → 0.5
						__hybrid_score: "0.7",
					},
				],
			});

			const hits = await backend.hybridSearch("query", [0.1, 0.2, 0.3], 10);

			expect(hits[0]).toEqual({ id: "a", score: 0.95, semanticScore: 1.0, keywordScore: 1.0 });
			expect(hits[1]).toEqual({ id: "b", score: 0.7, semanticScore: 0.5, keywordScore: 0.5 });
		});

		it("strips key prefix from IDs", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "8.4.0");

			mockFtHybrid.mockResolvedValueOnce({
				results: [
					{ id: "test_idx:my-doc", __vector_score: "0", __text_score: "1", __hybrid_score: "0.5" },
				],
			});

			const hits = await backend.hybridSearch("q", [0.1], 5);
			expect(hits[0]?.id).toBe("my-doc");
		});

		it("wraps errors in ToolError", async () => {
			const backend = makeVectorBackend();
			await initVectorBackend(backend, "8.4.0");
			mockFtHybrid.mockRejectedValueOnce(new Error("not supported"));

			await expect(backend.hybridSearch("q", [0.1], 5)).rejects.toThrow(
				/Redis native hybrid search failed/,
			);
		});
	});
});

// ---------------------------------------------------------------------------
// RedisSearchBackend
// ---------------------------------------------------------------------------

describe("RedisSearchBackend", () => {
	beforeEach(() => {
		mockFtInfo.mockClear();
		mockFtCreate.mockClear();
		mockFtSearch.mockClear();
		mockExec.mockClear();
		defaultPipeline.mockPipelineHSet.mockClear();
		defaultPipeline.mockPipelineDel.mockClear();
	});

	function makeSearchBackend() {
		// RedisSearchBackend takes an already-connected client
		const fakeClient = {
			ft: { info: mockFtInfo, create: mockFtCreate, search: mockFtSearch },
			multi: () => defaultPipeline.pipeline,
		};
		return new RedisSearchBackend(
			fakeClient as unknown as ReturnType<typeof import("redis").createClient>,
			{ indexName: "test_kw_idx" },
		);
	}

	describe("initialize()", () => {
		it("creates text-only index when absent", async () => {
			const backend = makeSearchBackend();
			mockFtInfo.mockRejectedValueOnce(new Error("Unknown index"));
			mockFtCreate.mockResolvedValueOnce("OK");

			await backend.initialize();

			expect(mockFtCreate).toHaveBeenCalledTimes(1);
			const [, schema] = mockFtCreate.mock.calls[0] ?? [];
			expect(schema.id.type).toBe("TEXT");
			expect(schema.content.type).toBe("TEXT");
			// Should NOT have a vector field
			expect(schema.embedding).toBeUndefined();
		});
	});

	describe("search()", () => {
		it("max-normalizes BM25 scores and strips prefix", async () => {
			const backend = makeSearchBackend();
			mockFtInfo.mockResolvedValueOnce({});
			await backend.initialize();

			mockFtSearch.mockResolvedValueOnce({
				documents: [
					{ id: "test_kw_idx:a", value: { __score: "10" } },
					{ id: "test_kw_idx:b", value: { __score: "5" } },
					{ id: "test_kw_idx:c", value: { __score: "2" } },
				],
			});

			const hits = await backend.search("query", 10);
			expect(hits[0]).toEqual({ id: "a", score: 1.0 });
			expect(hits[1]).toEqual({ id: "b", score: 0.5 });
			expect(hits[2]).toEqual({ id: "c", score: 0.2 });
		});

		it("returns empty array for no results", async () => {
			const backend = makeSearchBackend();
			mockFtInfo.mockResolvedValueOnce({});
			await backend.initialize();

			mockFtSearch.mockResolvedValueOnce({ documents: [] });

			const hits = await backend.search("query", 5);
			expect(hits).toEqual([]);
		});
	});

	describe("exactMatch()", () => {
		it("escapes RediSearch special characters and wraps in double quotes", async () => {
			const backend = makeSearchBackend();
			mockFtInfo.mockResolvedValueOnce({});
			await backend.initialize();

			mockFtSearch.mockResolvedValueOnce({
				documents: [{ id: "test_kw_idx:a", value: { content: "result" } }],
			});

			await backend.exactMatch("hello [world] (test)", 5);

			const [, ftQuery] = mockFtSearch.mock.calls[0] ?? [];
			// Special chars should be escaped with backslash, wrapped in quotes
			expect(ftQuery).toContain('"');
			expect(ftQuery).toContain("\\[");
			expect(ftQuery).toContain("\\]");
			expect(ftQuery).toContain("\\(");
			expect(ftQuery).toContain("\\)");
		});

		it("maps content from document value", async () => {
			const backend = makeSearchBackend();
			mockFtInfo.mockResolvedValueOnce({});
			await backend.initialize();

			mockFtSearch.mockResolvedValueOnce({
				documents: [{ id: "test_kw_idx:x", value: { content: "found it" } }],
			});

			const hits = await backend.exactMatch("query", 5);
			expect(hits[0]).toEqual({ id: "x", content: "found it" });
		});
	});

	describe("close()", () => {
		it("is a no-op (client owned by vector backend)", async () => {
			const backend = makeSearchBackend();
			// Should not throw or call quit
			await backend.close();
		});
	});
});
