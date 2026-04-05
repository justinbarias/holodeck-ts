export interface VectorSearchHit {
	readonly id: string;
	readonly score: number;
}

export interface KeywordSearchHit {
	readonly id: string;
	readonly score: number;
}

export interface ExactMatchHit {
	readonly id: string;
	readonly content: string;
}

export interface IndexableDocument {
	readonly id: string;
	readonly content: string;
	readonly embedding: number[];
	readonly metadata: Record<string, unknown>;
}

export interface StoredDocument {
	readonly id: string;
	readonly content: string;
	readonly metadata: Record<string, unknown>;
}

export interface VectorStoreConfig {
	readonly dimensions: number;
	readonly collectionName: string;
}

export interface KeywordSearchConfig {
	readonly indexName: string;
}

// ---------------------------------------------------------------------------
// Native hybrid search capability (Redis >= 8.4)
// ---------------------------------------------------------------------------

/** Result from a native server-side hybrid (text + vector) search. */
export interface HybridSearchHit {
	readonly id: string;
	/** Combined/fused score from server-side fusion. */
	readonly score: number;
	/** Individual semantic (vector) similarity score, if available. */
	readonly semanticScore?: number;
	/** Individual keyword (BM25) score, if available. */
	readonly keywordScore?: number;
}

/** Options for native hybrid search. */
export interface HybridSearchOptions {
	readonly semanticWeight?: number;
	readonly keywordWeight?: number;
	readonly rrfK?: number;
}

/**
 * Optional capability for backends that support native hybrid (text + vector)
 * search in a single server-side operation (e.g. Redis 8.4+ FT.HYBRID).
 */
export interface HybridSearchCapable {
	supportsNativeHybrid(): boolean;
	hybridSearch(
		query: string,
		embedding: number[],
		topK: number,
		options?: HybridSearchOptions,
	): Promise<HybridSearchHit[]>;
}

/** Type guard: returns true when the backend supports native hybrid search. */
export function isHybridSearchCapable(
	backend: VectorStoreBackend,
): backend is VectorStoreBackend & HybridSearchCapable {
	return (
		"supportsNativeHybrid" in backend &&
		typeof (backend as VectorStoreBackend & HybridSearchCapable).supportsNativeHybrid ===
			"function" &&
		(backend as VectorStoreBackend & HybridSearchCapable).supportsNativeHybrid()
	);
}

// ---------------------------------------------------------------------------
// Core backend interfaces
// ---------------------------------------------------------------------------

export interface VectorStoreBackend {
	initialize(): Promise<void>;
	upsert(docs: IndexableDocument[]): Promise<void>;
	search(embedding: number[], topK: number): Promise<VectorSearchHit[]>;
	retrieve(ids: string[]): Promise<Map<string, StoredDocument>>;
	getManifest(key: string): Promise<string | null>;
	setManifest(key: string, value: string): Promise<void>;
	delete(ids: string[]): Promise<void>;
	close(): Promise<void>;
}

export interface KeywordSearchBackend {
	initialize(): Promise<void>;
	index(docs: IndexableDocument[]): Promise<void>;
	search(query: string, topK: number): Promise<KeywordSearchHit[]>;
	exactMatch(query: string, topK: number): Promise<ExactMatchHit[]>;
	delete(ids: string[]): Promise<void>;
	close(): Promise<void>;
}
