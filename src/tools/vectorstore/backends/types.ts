export interface VectorSearchHit {
	readonly id: string;
	readonly score: number;
}

export interface KeywordSearchHit {
	readonly id: string;
	readonly score: number;
}

export interface IndexableChunk {
	readonly id: string;
	readonly content: string;
	readonly embedding: number[];
	readonly metadata: Record<string, unknown>;
}

export interface IndexableTextChunk {
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

export interface VectorStoreBackend {
	initialize(): Promise<void>;
	upsert(chunks: IndexableChunk[]): Promise<void>;
	search(embedding: number[], topK: number): Promise<VectorSearchHit[]>;
	delete(ids: string[]): Promise<void>;
	close(): Promise<void>;
}

export interface KeywordSearchBackend {
	initialize(): Promise<void>;
	index(chunks: IndexableTextChunk[]): Promise<void>;
	search(query: string, topK: number): Promise<KeywordSearchHit[]>;
	delete(ids: string[]): Promise<void>;
	close(): Promise<void>;
}
