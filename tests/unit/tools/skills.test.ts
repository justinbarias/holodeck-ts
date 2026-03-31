import { describe, expect, it } from "bun:test";
import type { Skill } from "../../../src/tools/skills.js";

describe("tools/skills Skill interface", () => {
	it("accepts valid skill objects", () => {
		const skill: Skill = {
			name: "deploy",
			description: "Automated deployment pipeline",
		};
		expect(skill.name).toBe("deploy");
		expect(skill.description).toBe("Automated deployment pipeline");
	});
});
