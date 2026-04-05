import type {
	ExactMatchHit,
	IndexableDocument,
	KeywordSearchBackend,
	KeywordSearchConfig,
	KeywordSearchHit,
	StoredDocument,
	VectorSearchHit,
	VectorStoreBackend,
	VectorStoreConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		const ai = a[i] ?? 0;
		const bi = b[i] ?? 0;
		dot += ai * bi;
		normA += ai * ai;
		normB += bi * bi;
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// InMemoryVectorBackend
// ---------------------------------------------------------------------------

interface StoredChunk {
	readonly embedding: number[];
	readonly content: string;
	readonly metadata: Record<string, unknown>;
}

export class InMemoryVectorBackend implements VectorStoreBackend {
	private readonly config: VectorStoreConfig;
	private store: Map<string, StoredChunk>;
	private manifestStore: Map<string, string>;
	private initialized: boolean;

	constructor(config: VectorStoreConfig) {
		this.config = config;
		this.store = new Map();
		this.manifestStore = new Map();
		this.initialized = false;
	}

	async initialize(): Promise<void> {
		this.initialized = true;
	}

	async upsert(docs: IndexableDocument[]): Promise<void> {
		if (!this.initialized) {
			throw new Error("InMemoryVectorBackend: call initialize() before upsert()");
		}
		for (const doc of docs) {
			if (doc.embedding.length !== this.config.dimensions) {
				throw new Error(
					`InMemoryVectorBackend: expected embedding dimension ${this.config.dimensions}, got ${doc.embedding.length} for id "${doc.id}"`,
				);
			}
			this.store.set(doc.id, {
				embedding: doc.embedding,
				content: doc.content,
				metadata: doc.metadata,
			});
		}
	}

	async search(embedding: number[], topK: number): Promise<VectorSearchHit[]> {
		if (!this.initialized) {
			throw new Error("InMemoryVectorBackend: call initialize() before search()");
		}
		if (this.store.size === 0) return [];

		const results: VectorSearchHit[] = [];
		for (const [id, chunk] of this.store) {
			const score = cosineSimilarity(embedding, chunk.embedding);
			results.push({ id, score });
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, topK);
	}

	async retrieve(ids: string[]): Promise<Map<string, StoredDocument>> {
		if (!this.initialized) {
			throw new Error("InMemoryVectorBackend: call initialize() before retrieve()");
		}
		const result = new Map<string, StoredDocument>();
		for (const id of ids) {
			const entry = this.store.get(id);
			if (entry) {
				result.set(id, { id, content: entry.content, metadata: entry.metadata });
			}
		}
		return result;
	}

	async getManifest(key: string): Promise<string | null> {
		return this.manifestStore.get(key) ?? null;
	}

	async setManifest(key: string, value: string): Promise<void> {
		this.manifestStore.set(key, value);
	}

	async delete(ids: string[]): Promise<void> {
		if (!this.initialized) {
			throw new Error("InMemoryVectorBackend: call initialize() before delete()");
		}
		for (const id of ids) {
			this.store.delete(id);
		}
	}

	async close(): Promise<void> {
		this.store = new Map();
		this.manifestStore = new Map();
		this.initialized = false;
	}
}

// ---------------------------------------------------------------------------
// InMemoryBM25Backend
// ---------------------------------------------------------------------------

// BM25 parameters
const BM25_K1 = 1.2;
const BM25_B = 0.75;

interface InvertedEntry {
	/** document frequency of term */
	df: number;
	/** map from docId -> term frequency in that doc */
	postings: Map<string, number>;
}

export class InMemoryBM25Backend implements KeywordSearchBackend {
	private invertedIndex: Map<string, InvertedEntry>;
	/** per-document token count */
	private docLengths: Map<string, number>;
	private contentStore: Map<string, string>;
	/** total number of indexed documents */
	private docCount: number;
	/** cumulative sum of all document lengths (for avgdl) */
	private totalDocLength: number;
	private initialized: boolean;

	constructor(_config: KeywordSearchConfig) {
		this.invertedIndex = new Map();
		this.docLengths = new Map();
		this.contentStore = new Map();
		this.docCount = 0;
		this.totalDocLength = 0;
		this.initialized = false;
	}

	async initialize(): Promise<void> {
		this.initialized = true;
	}

	async index(docs: IndexableDocument[]): Promise<void> {
		if (!this.initialized) {
			throw new Error("InMemoryBM25Backend: call initialize() before index()");
		}

		for (const chunk of docs) {
			// If document already exists, remove it first to handle upsert semantics
			const existingLength = this.docLengths.get(chunk.id);
			if (existingLength !== undefined) {
				this._removeDoc(chunk.id);
			}

			this.contentStore.set(chunk.id, chunk.content);

			const tokens = tokenize(chunk.content);
			const dl = tokens.length;
			this.docLengths.set(chunk.id, dl);
			this.docCount += 1;
			this.totalDocLength += dl;

			// Count term frequencies in this document
			const tf = new Map<string, number>();
			for (const token of tokens) {
				tf.set(token, (tf.get(token) ?? 0) + 1);
			}

			// Update inverted index
			for (const [term, freq] of tf) {
				let entry = this.invertedIndex.get(term);
				if (!entry) {
					entry = { df: 0, postings: new Map() };
					this.invertedIndex.set(term, entry);
				}
				entry.postings.set(chunk.id, freq);
				entry.df = entry.postings.size;
			}
		}
	}

	async search(query: string, topK: number): Promise<KeywordSearchHit[]> {
		if (!this.initialized) {
			throw new Error("InMemoryBM25Backend: call initialize() before search()");
		}
		if (this.docCount === 0) return [];

		const queryTerms = tokenize(query);
		if (queryTerms.length === 0) return [];

		const avgdl = this.totalDocLength / this.docCount;
		const scores = new Map<string, number>();

		for (const term of queryTerms) {
			const entry = this.invertedIndex.get(term);
			if (!entry) continue;

			const df = entry.df;
			// IDF with smoothing: ln((N - df + 0.5) / (df + 0.5) + 1)
			const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

			for (const [docId, tf] of entry.postings) {
				const dl = this.docLengths.get(docId) ?? 0;
				const numerator = tf * (BM25_K1 + 1);
				const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl));
				const termScore = idf * (numerator / denominator);
				scores.set(docId, (scores.get(docId) ?? 0) + termScore);
			}
		}

		if (scores.size === 0) return [];

		// Normalize by max score
		let maxScore = 0;
		for (const s of scores.values()) {
			if (s > maxScore) maxScore = s;
		}

		const results: KeywordSearchHit[] = [];
		for (const [id, score] of scores) {
			results.push({ id, score: maxScore > 0 ? score / maxScore : 0 });
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, topK);
	}

	async delete(ids: string[]): Promise<void> {
		if (!this.initialized) {
			throw new Error("InMemoryBM25Backend: call initialize() before delete()");
		}
		for (const id of ids) {
			this._removeDoc(id);
		}
	}

	async exactMatch(query: string, topK: number): Promise<ExactMatchHit[]> {
		if (!this.initialized) {
			throw new Error("InMemoryBM25Backend: call initialize() before exactMatch()");
		}
		const lower = query.toLowerCase();
		const results: ExactMatchHit[] = [];
		for (const [id, content] of this.contentStore) {
			if (content.toLowerCase().includes(lower)) {
				results.push({ id, content });
				if (results.length >= topK) break;
			}
		}
		return results;
	}

	async close(): Promise<void> {
		this.invertedIndex = new Map();
		this.docLengths = new Map();
		this.contentStore = new Map();
		this.docCount = 0;
		this.totalDocLength = 0;
		this.initialized = false;
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	private _removeDoc(id: string): void {
		const dl = this.docLengths.get(id);
		if (dl === undefined) return; // doc not indexed

		this.docLengths.delete(id);
		this.contentStore.delete(id);
		this.docCount = Math.max(0, this.docCount - 1);
		this.totalDocLength = Math.max(0, this.totalDocLength - dl);

		// Remove from postings lists; prune terms with no remaining postings
		const emptyTerms: string[] = [];
		for (const [term, entry] of this.invertedIndex) {
			if (entry.postings.has(id)) {
				entry.postings.delete(id);
				entry.df = entry.postings.size;
				if (entry.postings.size === 0) {
					emptyTerms.push(term);
				}
			}
		}
		for (const term of emptyTerms) {
			this.invertedIndex.delete(term);
		}
	}
}
