import { Client } from "@opensearch-project/opensearch";
import { ToolError } from "../../../lib/errors.js";
import { getModuleLogger } from "../../../lib/logger.js";
import type {
	ExactMatchHit,
	IndexableDocument,
	KeywordSearchBackend,
	KeywordSearchHit,
} from "./types.js";

const logger = getModuleLogger("vectorstore.backends.opensearch");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface OpenSearchConfig {
	/** OpenSearch node URL, e.g. "http://localhost:9200" */
	readonly url: string;
	/** Index name to store / search documents in */
	readonly indexName: string;
	/** Extra HTTP headers forwarded on every request */
	readonly headers?: Record<string, string>;
	/** Per-request timeout in seconds (default: 60) */
	readonly requestTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Internal document shape stored in OpenSearch
// ---------------------------------------------------------------------------

interface IndexedDocument {
	content: string;
	metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response shape helpers (avoids `any`)
// ---------------------------------------------------------------------------

interface SearchHitSource {
	content?: string;
	metadata?: Record<string, unknown>;
}

interface SearchHit {
	_id: string;
	_score?: number | string | null;
	_source?: SearchHitSource;
}

interface HitsMetadata {
	hits: SearchHit[];
	max_score?: number | string | null;
}

interface SearchResponseBody {
	hits: HitsMetadata;
}

interface BulkResponseItem {
	index?: { error?: { reason?: string } };
	delete?: { error?: { reason?: string } };
}

interface BulkResponseBody {
	errors: boolean;
	items: Array<Record<string, BulkResponseItem[keyof BulkResponseItem]>>;
}

// The OpenSearch SDK types the bulk body as `Record<string, any>[]`.
// We build the body as `object[]` (which is assignable to `Record<string, unknown>[]`)
// and cast it once via this alias at the call site to satisfy tsc without `any`.
type BulkRequestBody = Parameters<(typeof Client.prototype)["bulk"]>[0]["body"];

// ---------------------------------------------------------------------------
// OpenSearchBackend
// ---------------------------------------------------------------------------

export class OpenSearchBackend implements KeywordSearchBackend {
	private readonly config: OpenSearchConfig;
	private readonly client: Client;
	private initialized: boolean;

	constructor(config: OpenSearchConfig) {
		this.config = config;
		this.initialized = false;

		this.client = new Client({
			node: config.url,
			headers: config.headers ?? {},
			requestTimeout: config.requestTimeoutMs ?? 60_000,
		});
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	async initialize(): Promise<void> {
		const { indexName } = this.config;

		try {
			const exists = await this.client.indices.exists({ index: indexName });

			if (!exists.body) {
				logger.info`Creating OpenSearch index: ${indexName}`;

				await this.client.indices.create({
					index: indexName,
					body: {
						settings: {
							number_of_shards: 1,
							number_of_replicas: 1,
							analysis: {
								analyzer: {
									holodeck_text: {
										type: "standard",
										stopwords: "_english_",
									},
								},
							},
						},
						mappings: {
							properties: {
								content: {
									type: "text",
									analyzer: "holodeck_text",
								},
								metadata: {
									type: "object",
									enabled: false,
								},
							},
						},
					},
				});

				logger.info`OpenSearch index created: ${indexName}`;
			} else {
				logger.debug`OpenSearch index already exists: ${indexName}`;
			}

			this.initialized = true;
		} catch (err) {
			throw new ToolError(`Failed to initialize OpenSearch index "${indexName}"`, {
				backend: "opensearch",
				operation: "initialize",
				cause: err instanceof Error ? err : new Error(String(err)),
			});
		}
	}

	async index(docs: IndexableDocument[]): Promise<void> {
		this.assertInitialized("index");

		if (docs.length === 0) return;

		const { indexName } = this.config;

		// Build bulk body: alternating action + document lines.
		// Collected as object[] then cast to the SDK's body type at the call site.
		const bulkOps: object[] = [];
		for (const chunk of docs) {
			bulkOps.push({ index: { _index: indexName, _id: chunk.id } });
			const doc: IndexedDocument = {
				content: chunk.content,
				metadata: chunk.metadata,
			};
			bulkOps.push(doc);
		}

		try {
			const response = await this.client.bulk({ body: bulkOps as BulkRequestBody });
			const responseBody = response.body as BulkResponseBody;

			if (responseBody.errors) {
				const failedItems = responseBody.items
					.map((item) => {
						const op = item.index as BulkResponseItem["index"];
						return op?.error?.reason ?? null;
					})
					.filter((reason): reason is string => reason !== null);

				logger.warn`OpenSearch bulk index had errors: ${failedItems.join("; ")}`;
			}

			logger.debug`OpenSearch bulk indexed ${docs.length} chunks into "${indexName}"`;
		} catch (err) {
			throw new ToolError(
				`Failed to bulk index ${docs.length} chunks into OpenSearch "${indexName}"`,
				{
					backend: "opensearch",
					operation: "index",
					cause: err instanceof Error ? err : new Error(String(err)),
				},
			);
		}
	}

	async search(query: string, topK: number): Promise<KeywordSearchHit[]> {
		this.assertInitialized("search");

		const { indexName } = this.config;

		try {
			const response = await this.client.search({
				index: indexName,
				body: {
					size: topK,
					query: {
						multi_match: {
							query,
							fields: ["content"],
							type: "best_fields",
						},
					},
				},
			});

			const responseBody = response.body as SearchResponseBody;
			const hitsMetadata = responseBody.hits;
			const rawMaxScore = hitsMetadata.max_score;
			const maxScore = rawMaxScore !== null && rawMaxScore !== undefined ? Number(rawMaxScore) : 0;

			if (hitsMetadata.hits.length === 0) return [];

			const results: KeywordSearchHit[] = hitsMetadata.hits.map((hit) => {
				const rawScore = hit._score;
				const score = rawScore !== null && rawScore !== undefined ? Number(rawScore) : 0;
				const normalized = maxScore > 0 ? score / maxScore : 0;
				return { id: hit._id, score: normalized };
			});

			// Results already come back sorted by score descending from OpenSearch.
			// Re-sort by normalized score descending as a precaution.
			results.sort((a, b) => b.score - a.score);
			return results;
		} catch (err) {
			throw new ToolError(`Failed to search OpenSearch index "${indexName}"`, {
				backend: "opensearch",
				operation: "search",
				cause: err instanceof Error ? err : new Error(String(err)),
			});
		}
	}

	async exactMatch(query: string, topK: number): Promise<ExactMatchHit[]> {
		this.assertInitialized("exactMatch");

		const { indexName } = this.config;

		try {
			const response = await this.client.search({
				index: indexName,
				body: {
					size: topK,
					query: {
						match_phrase: {
							content: query,
						},
					},
				},
			});

			const responseBody = response.body as SearchResponseBody;
			const hits = responseBody.hits.hits;

			return hits.map((hit) => ({
				id: hit._id,
				content: hit._source?.content ?? "",
			}));
		} catch (err) {
			throw new ToolError(`Failed to exact match search OpenSearch index "${indexName}"`, {
				backend: "opensearch",
				operation: "exactMatch",
				cause: err instanceof Error ? err : new Error(String(err)),
			});
		}
	}

	async delete(ids: string[]): Promise<void> {
		this.assertInitialized("delete");

		if (ids.length === 0) return;

		const { indexName } = this.config;

		const deleteOps: object[] = [];
		for (const id of ids) {
			deleteOps.push({ delete: { _index: indexName, _id: id } });
		}

		try {
			const response = await this.client.bulk({ body: deleteOps as BulkRequestBody });
			const responseBody = response.body as BulkResponseBody;

			if (responseBody.errors) {
				const failedItems = responseBody.items
					.map((item) => {
						const op = item.delete as BulkResponseItem["delete"];
						return op?.error?.reason ?? null;
					})
					.filter((reason): reason is string => reason !== null);

				if (failedItems.length > 0) {
					logger.warn`OpenSearch bulk delete had errors: ${failedItems.join("; ")}`;
				}
			}

			logger.debug`OpenSearch bulk deleted ${ids.length} documents from "${indexName}"`;
		} catch (err) {
			throw new ToolError(
				`Failed to delete ${ids.length} documents from OpenSearch "${indexName}"`,
				{
					backend: "opensearch",
					operation: "delete",
					cause: err instanceof Error ? err : new Error(String(err)),
				},
			);
		}
	}

	async close(): Promise<void> {
		try {
			await this.client.close();
		} catch (err) {
			logger.warn`OpenSearch client close error: ${String(err)}`;
		} finally {
			this.initialized = false;
		}
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	private assertInitialized(operation: string): void {
		if (!this.initialized) {
			throw new ToolError(`OpenSearchBackend: call initialize() before ${operation}()`, {
				backend: "opensearch",
				operation,
			});
		}
	}
}
