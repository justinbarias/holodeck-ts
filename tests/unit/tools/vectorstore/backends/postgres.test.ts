import { beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock postgres + pgvector
// ---------------------------------------------------------------------------

const mockEnd = mock();
const toSqlCalls: number[][] = [];

/**
 * The `postgres` library returns a callable tagged-template function that also
 * has properties like `.end()`, `.unsafe()`, and is callable as `sql(identifier)`.
 *
 * We use a configurable `queryResults` array that the Proxy returns on each
 * tagged-template invocation (shifting from the front). This lets individual
 * tests control what "rows" the SQL queries return.
 */
const queryResults: { results: unknown[] } = { results: [] };

function makeSqlProxy() {
	const handler: ProxyHandler<CallableFunction> = {
		// Tagged template call: sql`SELECT ...` or direct call sql(identifier)
		apply: (_target, _thisArg, args) => {
			// If called with a single string arg, it's sql(identifier) — return the string
			if (args.length === 1 && typeof args[0] === "string") {
				return args[0];
			}
			// Tagged template — return next result from the queue
			const result = queryResults.results.shift() ?? [];
			return Promise.resolve(result);
		},
		get: (_target, prop) => {
			if (prop === "end") return mockEnd;
			if (prop === "unsafe") return (s: string) => s;
			// For Symbol properties and others, return a no-op
			if (typeof prop === "symbol") return undefined;
			// sql(identifier) — return the identifier itself
			return (name: string) => name;
		},
	};

	return new Proxy((() => {}) as CallableFunction, handler);
}

mock.module("postgres", () => ({
	default: () => makeSqlProxy(),
}));

mock.module("pgvector", () => ({
	toSql: (v: number[]) => {
		toSqlCalls.push(v);
		return `[${v.join(",")}]`;
	},
}));

// Import AFTER mock.module
import {
	PostgresFTSBackend,
	PostgresVectorBackend,
} from "../../../../../src/tools/vectorstore/backends/postgres.js";
import type { IndexableDocument } from "../../../../../src/tools/vectorstore/backends/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVectorBackend() {
	return new PostgresVectorBackend({
		connectionString: "postgresql://localhost:5432/test",
		tableName: "test_vectors",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PostgresVectorBackend", () => {
	beforeEach(() => {
		mockEnd.mockClear();
		queryResults.results = [];
		toSqlCalls.length = 0;
	});

	// -----------------------------------------------------------------------
	// initialize
	// -----------------------------------------------------------------------

	describe("initialize()", () => {
		it("completes without error when queries succeed", async () => {
			// initialize runs 4 SQL queries (CREATE EXTENSION, CREATE TABLE, CREATE INDEX, CREATE meta TABLE)
			queryResults.results = [[], [], [], []];

			const backend = makeVectorBackend();
			await backend.initialize();
			// No error thrown = success
		});

		it("wraps SQL errors in ToolError", async () => {
			queryResults.results = [Promise.reject(new Error("connection refused"))];

			// Need a fresh backend since the proxy is per-constructor
			const backend = makeVectorBackend();
			await expect(backend.initialize()).rejects.toThrow(
				/Failed to initialize Postgres vector backend/,
			);
		});
	});

	// -----------------------------------------------------------------------
	// search — score normalization
	// -----------------------------------------------------------------------

	describe("search()", () => {
		it("converts 1 - distance to score", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			// Search query returns rows with distance as string
			queryResults.results = [
				[
					{ id: "a", distance: "0" },
					{ id: "b", distance: "0.3" },
					{ id: "c", distance: "1" },
				],
			];

			const hits = await backend.search([0.1, 0.2, 0.3], 5);
			expect(hits[0]).toEqual({ id: "a", score: 1.0 });
			expect(hits[1]).toEqual({ id: "b", score: 0.7 });
			expect(hits[2]).toEqual({ id: "c", score: 0.0 });
		});

		it("calls toSql on embedding", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			toSqlCalls.length = 0;
			queryResults.results = [[]]; // search returns empty

			await backend.search([0.5, 0.6, 0.7], 3);

			// toSql should have been called with the embedding
			expect(toSqlCalls.length).toBeGreaterThanOrEqual(1);
			const searchCall = toSqlCalls.at(-1);
			expect(searchCall).toEqual([0.5, 0.6, 0.7]);
		});
	});

	// -----------------------------------------------------------------------
	// upsert
	// -----------------------------------------------------------------------

	describe("upsert()", () => {
		it("calls toSql() on embeddings", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			toSqlCalls.length = 0;
			// One INSERT per doc
			queryResults.results = [[]];

			await backend.upsert([makeDoc({ embedding: [1, 2, 3] })]);

			expect(toSqlCalls).toContainEqual([1, 2, 3]);
		});

		it("is a no-op for empty docs", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			toSqlCalls.length = 0;
			await backend.upsert([]);
			// No toSql calls for empty input
			expect(toSqlCalls.length).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// retrieve
	// -----------------------------------------------------------------------

	describe("retrieve()", () => {
		it("maps rows to StoredDocument Map", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			queryResults.results = [
				[
					{ id: "a", content: "alpha", metadata: { k: "v" } },
					{ id: "b", content: "beta", metadata: { n: 1 } },
				],
			];

			const result = await backend.retrieve(["a", "b"]);
			expect(result.size).toBe(2);
			expect(result.get("a")).toEqual({ id: "a", content: "alpha", metadata: { k: "v" } });
			expect(result.get("b")).toEqual({ id: "b", content: "beta", metadata: { n: 1 } });
		});

		it("returns empty Map for empty ids", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			const result = await backend.retrieve([]);
			expect(result.size).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------

	describe("delete()", () => {
		it("is a no-op for empty ids", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			// Should not throw or execute SQL
			await backend.delete([]);
		});
	});

	// -----------------------------------------------------------------------
	// close
	// -----------------------------------------------------------------------

	describe("close()", () => {
		it("calls sql.end()", async () => {
			const backend = makeVectorBackend();
			queryResults.results = [[], [], [], []]; // initialize
			await backend.initialize();

			await backend.close();
			expect(mockEnd).toHaveBeenCalledTimes(1);
		});
	});
});

// ---------------------------------------------------------------------------
// PostgresFTSBackend
// ---------------------------------------------------------------------------

describe("PostgresFTSBackend", () => {
	beforeEach(() => {
		mockEnd.mockClear();
		queryResults.results = [];
	});

	// We need a shared sql client from the vector backend
	function makeFTSBackend() {
		const vectorBackend = makeVectorBackend();
		const client = vectorBackend.getClient();
		return new PostgresFTSBackend("test_vectors", client);
	}

	describe("search()", () => {
		it("max-normalizes ts_rank scores", async () => {
			const backend = makeFTSBackend();
			queryResults.results = [[], []]; // initialize (ALTER TABLE + CREATE INDEX)
			await backend.initialize();

			queryResults.results = [
				[
					{ id: "a", rank: "0.5" },
					{ id: "b", rank: "0.1" },
					{ id: "c", rank: "0.3" },
				],
			];

			const hits = await backend.search("query", 10);
			expect(hits[0]).toEqual({ id: "a", score: 1.0 }); // 0.5 / 0.5
			expect(hits[1]).toEqual({ id: "b", score: 0.2 }); // 0.1 / 0.5
			expect(hits[2]).toEqual({ id: "c", score: 0.6 }); // 0.3 / 0.5
		});

		it("handles maxRank=0 (divides by 1)", async () => {
			const backend = makeFTSBackend();
			queryResults.results = [[], []]; // initialize
			await backend.initialize();

			queryResults.results = [[{ id: "a", rank: "0" }]];

			const hits = await backend.search("query", 5);
			expect(hits[0]?.score).toBe(0);
		});

		it("returns empty for no results", async () => {
			const backend = makeFTSBackend();
			queryResults.results = [[], []]; // initialize
			await backend.initialize();

			queryResults.results = [[]];

			const hits = await backend.search("query", 5);
			expect(hits).toEqual([]);
		});
	});

	describe("exactMatch()", () => {
		it("maps rows to ExactMatchHit", async () => {
			const backend = makeFTSBackend();
			queryResults.results = [[], []]; // initialize
			await backend.initialize();

			queryResults.results = [
				[
					{ id: "a", content: "hello world" },
					{ id: "b", content: "foo bar" },
				],
			];

			const hits = await backend.exactMatch("hello", 5);
			expect(hits).toEqual([
				{ id: "a", content: "hello world" },
				{ id: "b", content: "foo bar" },
			]);
		});
	});

	describe("close()", () => {
		it("calls sql.end() when ownsSql=true (string constructor)", async () => {
			// When constructed with a string, the backend owns the SQL client
			const backend = new PostgresFTSBackend("test_vectors", "postgresql://localhost:5432/test");

			await backend.close();
			expect(mockEnd).toHaveBeenCalledTimes(1);
		});

		it("does NOT call sql.end() when ownsSql=false (shared client)", async () => {
			const backend = makeFTSBackend(); // uses shared client

			await backend.close();
			expect(mockEnd).not.toHaveBeenCalled();
		});
	});
});
