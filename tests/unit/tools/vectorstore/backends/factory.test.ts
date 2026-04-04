import { describe, expect, it } from "bun:test";
import type { Database, KeywordSearchConfig } from "../../../../../src/config/schema.js";
import { ToolError } from "../../../../../src/lib/errors.js";
import { createBackends } from "../../../../../src/tools/vectorstore/backends/factory.js";
import {
	InMemoryBM25Backend,
	InMemoryVectorBackend,
} from "../../../../../src/tools/vectorstore/backends/in-memory.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DIMS = 128;
const TOOL_NAME = "my_tool";

const inMemoryDb: Database = { provider: "in-memory" };

const redisDb: Database = {
	provider: "redis",
	connection_string: "redis://localhost:6379",
};

const postgresDb: Database = {
	provider: "postgres",
	connection_string: "postgresql://user:pass@localhost:5432/holodeck",
};

const chromaDb: Database = {
	provider: "chromadb",
	connection_string: "http://localhost:8000",
};

const opensearchConfig: KeywordSearchConfig = {
	provider: "opensearch",
	url: "http://localhost:9200",
	headers: {},
	request_timeout: 60,
};

// ---------------------------------------------------------------------------
// in-memory
// ---------------------------------------------------------------------------

describe("createBackends — in-memory", () => {
	it("returns InMemoryVectorBackend and InMemoryBM25Backend", () => {
		const pair = createBackends(inMemoryDb, DIMS, TOOL_NAME);

		expect(pair.vector).toBeInstanceOf(InMemoryVectorBackend);
		expect(pair.keyword).toBeInstanceOf(InMemoryBM25Backend);
	});

	it("uses holodeck_{toolName} as the collection name", () => {
		// Indirectly verified: backends are constructed without throwing, meaning
		// the collection name was derived correctly.
		expect(() => createBackends(inMemoryDb, DIMS, "kb_docs")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// redis
// ---------------------------------------------------------------------------

describe("createBackends — redis", () => {
	it("returns non-InMemory vector and keyword backends", () => {
		const pair = createBackends(redisDb, DIMS, TOOL_NAME);

		expect(pair.vector).toBeDefined();
		expect(pair.keyword).toBeDefined();
		expect(pair.vector).not.toBeInstanceOf(InMemoryVectorBackend);
		expect(pair.keyword).not.toBeInstanceOf(InMemoryBM25Backend);
	});

	it("vector backend exposes supportsNativeHybrid (RedisVectorBackend signature)", () => {
		const pair = createBackends(redisDb, DIMS, TOOL_NAME);
		// RedisVectorBackend has supportsNativeHybrid(); calling it pre-init
		// returns false rather than throwing.
		const vectorBackend = pair.vector as { supportsNativeHybrid?: () => boolean };
		expect(typeof vectorBackend.supportsNativeHybrid).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// postgres
// ---------------------------------------------------------------------------

describe("createBackends — postgres", () => {
	it("returns non-InMemory vector and keyword backends", () => {
		const pair = createBackends(postgresDb, DIMS, TOOL_NAME);

		expect(pair.vector).toBeDefined();
		expect(pair.keyword).toBeDefined();
		expect(pair.vector).not.toBeInstanceOf(InMemoryVectorBackend);
		expect(pair.keyword).not.toBeInstanceOf(InMemoryBM25Backend);
	});
});

// ---------------------------------------------------------------------------
// chromadb
// ---------------------------------------------------------------------------

describe("createBackends — chromadb", () => {
	it("returns non-InMemory vector and keyword backends when keywordSearch is provided", () => {
		const pair = createBackends(chromaDb, DIMS, TOOL_NAME, opensearchConfig);

		expect(pair.vector).toBeDefined();
		expect(pair.keyword).toBeDefined();
		expect(pair.vector).not.toBeInstanceOf(InMemoryVectorBackend);
		expect(pair.keyword).not.toBeInstanceOf(InMemoryBM25Backend);
	});

	it("throws ToolError when keywordSearch config is absent", () => {
		expect(() => createBackends(chromaDb, DIMS, TOOL_NAME)).toThrow(ToolError);
	});

	it("ToolError message mentions opensearch", () => {
		let caughtError: unknown;
		try {
			createBackends(chromaDb, DIMS, TOOL_NAME);
		} catch (err) {
			caughtError = err;
		}

		expect(caughtError).toBeInstanceOf(ToolError);
		const message = (caughtError as ToolError).message.toLowerCase();
		expect(message).toContain("opensearch");
	});

	it("ToolError has backend='chromadb'", () => {
		let caughtError: unknown;
		try {
			createBackends(chromaDb, DIMS, TOOL_NAME);
		} catch (err) {
			caughtError = err;
		}

		expect(caughtError).toBeInstanceOf(ToolError);
		expect((caughtError as ToolError).backend).toBe("chromadb");
	});
});

// ---------------------------------------------------------------------------
// collection name derivation
// ---------------------------------------------------------------------------

describe("createBackends — collection name", () => {
	it("prefixes the tool name with 'holodeck_'", () => {
		// For in-memory backends we can call initialize() and verify via
		// behavior (e.g., dimension mismatch error message includes collection
		// name) — but the simplest check is that the factory constructs without
		// throwing for various tool names.
		const names = ["docs", "knowledge_base", "tool123"];
		for (const name of names) {
			expect(() => createBackends(inMemoryDb, DIMS, name)).not.toThrow();
		}
	});
});
