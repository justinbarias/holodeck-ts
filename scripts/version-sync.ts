#!/usr/bin/env bun

/**
 * Syncs the VERSION constant in src/index.ts from package.json.
 *
 * Run this after changelogen bumps the version:
 *   bun run release        # changelogen bumps package.json + creates git tag
 *   bun scripts/version-sync.ts  # sync VERSION constant
 *
 * Or it runs automatically as part of the build via prepack.
 */

const pkg = await Bun.file("package.json").json();
const version: string = pkg.version;

const indexPath = "src/index.ts";
const content = await Bun.file(indexPath).text();
const updated = content.replace(
	/export const VERSION = "[^"]+";/,
	`export const VERSION = "${version}";`,
);

if (content !== updated) {
	await Bun.write(indexPath, updated);
	console.log(`Synced VERSION to ${version}`);
} else {
	console.log(`VERSION already at ${version}`);
}
