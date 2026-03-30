import { basename, dirname, resolve } from "node:path";
import { toErrorMessage } from "../lib/errors.js";
import { getModuleLogger } from "../lib/logger.js";

export interface Skill {
	name: string;
	description: string;
	instructions: string;
	path: string;
}

const skillsLogger = getModuleLogger("skills");

function extractDescription(content: string): string | null {
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}

		if (trimmed.startsWith("#")) {
			const heading = trimmed.replace(/^#+\s*/, "").trim();
			return heading.length > 0 ? heading : null;
		}

		return trimmed;
	}

	return null;
}

export async function discoverSkills(basePath: string): Promise<Skill[]> {
	const resolvedBasePath = resolve(basePath);
	const discovered: Skill[] = [];
	const skillGlob = new Bun.Glob(".claude/skills/*/SKILL.md");

	for await (const skillPath of skillGlob.scan({
		cwd: resolvedBasePath,
		absolute: true,
	})) {
		try {
			const content = (await Bun.file(skillPath).text()).trim();
			if (content.length === 0) {
				skillsLogger.warn("Skipping empty skill file at {path}.", { path: skillPath });
				continue;
			}

			const description = extractDescription(content);
			if (!description) {
				skillsLogger.warn("Skipping invalid skill without description at {path}.", {
					path: skillPath,
				});
				continue;
			}

			discovered.push({
				name: basename(dirname(skillPath)),
				description,
				instructions: content,
				path: skillPath,
			});
		} catch (error) {
			skillsLogger.warn("Failed to read skill at {path}.", {
				path: skillPath,
				error: toErrorMessage(error),
			});
		}
	}

	return discovered;
}
