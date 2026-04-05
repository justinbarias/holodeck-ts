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
