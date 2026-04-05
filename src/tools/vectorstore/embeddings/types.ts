export interface EmbeddingProvider {
	/** Batch embed text strings, returns one vector per input */
	embed(texts: string[]): Promise<number[][]>;
	/** Return the dimensionality of the embeddings this provider produces */
	dimensions(): number;
}
