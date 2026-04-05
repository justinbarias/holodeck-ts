import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Glob } from "bun";
import { ToolError } from "../../lib/errors.js";
import { getModuleLogger } from "../../lib/logger.js";

const logger = getModuleLogger("vectorstore.discovery");

export const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".html", ".htm", ".docx", ".pdf"]);

export interface DiscoveredFile {
	path: string;
	extension: string;
	modifiedAt: Date;
	sha256: string;
}

/**
 * Discovers supported files from a source path (file, directory, or glob pattern).
 *
 * - Globs the source path for all files
 * - Skips files with unsupported extensions (warns via logger)
 * - Throws `ToolError` if no supported files are found
 */
export async function discoverFiles(source: string): Promise<DiscoveredFile[]> {
	const glob = new Glob("**/*");

	// Collect all candidate paths from the source
	const candidatePaths: string[] = [];

	for await (const file of glob.scan({ cwd: source, onlyFiles: true, followSymlinks: true })) {
		candidatePaths.push(`${source}/${file}`);
	}

	// If the glob scan returned nothing, try treating source as a direct file or glob pattern
	if (candidatePaths.length === 0) {
		// Try as a direct file path
		const directGlob = new Glob(source);
		for await (const file of directGlob.scan({ onlyFiles: true, followSymlinks: true })) {
			candidatePaths.push(file);
		}
	}

	const discovered: DiscoveredFile[] = [];

	for (const filePath of candidatePaths) {
		const ext = extname(filePath).toLowerCase();

		if (!SUPPORTED_EXTENSIONS.has(ext)) {
			logger.warn`Skipping unsupported file type: ${filePath}`;
			continue;
		}

		const fileStat = await stat(filePath);
		const content = await Bun.file(filePath).arrayBuffer();
		const hasher = new Bun.CryptoHasher("sha256");
		hasher.update(content);
		const sha256 = hasher.digest("hex");
		discovered.push({
			path: filePath,
			extension: ext,
			modifiedAt: fileStat.mtime,
			sha256,
		});
	}

	if (discovered.length === 0) {
		throw new ToolError(`no documents found in ${source}`, { operation: "discoverFiles" });
	}

	return discovered;
}
