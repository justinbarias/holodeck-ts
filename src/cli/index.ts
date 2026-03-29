#!/usr/bin/env bun
import { Command } from "commander";
import { VERSION } from "../index.js";

const program = new Command();

program.name("holodeck").description("No-code AI agent experimentation platform").version(VERSION);

program
	.command("chat [config]")
	.description("Interactive streaming chat session")
	.action((_config?: string) => {
		console.log("holodeck chat — not yet implemented");
	});

program
	.command("test [config]")
	.description("Run test cases with evaluation grading")
	.option("--output <path>", "Save report to file")
	.option("--format <fmt>", "Report format: json or markdown", "json")
	.option("-v, --verbose", "Verbose output")
	.option("-q, --quiet", "Summary only")
	.option("--timeout <seconds>", "LLM execution timeout", "60")
	.action((_config?: string) => {
		console.log("holodeck test — not yet implemented");
	});

program.parse();
