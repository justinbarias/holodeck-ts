export interface ConvertOptions {
	/** Source file path (for logging/error context) */
	readonly sourcePath?: string;
}

export interface DocumentConverter {
	/** Convert a document buffer to markdown string */
	convert(input: Buffer, options?: ConvertOptions): Promise<string>;
	/** Check if this converter supports the given file extension (with leading dot) */
	supports(extension: string): boolean;
}
