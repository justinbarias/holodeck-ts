#!/usr/bin/env bun
import { Command } from "commander";
import { VERSION } from "../index.js";
import { chatCommand } from "./commands/chat.js";

const program = new Command();

program.name("holodeck").description("No-code AI agent experimentation platform").version(VERSION);
program.addCommand(chatCommand());

program
	.command("test [config]")
	.description("Run test cases with evaluation grading")
	.option("--output <path>", "Save report to file")
	.option("--format <fmt>", "Report format: json or markdown", "json")
	.option("-v, --verbose", "Verbose output")
	.option("-q, --quiet", "Summary only")
	.option("--timeout <seconds>", "LLM execution timeout", "60")
	.action((_config?: string) => {
		process.stderr.write("holodeck test is not yet implemented.\n");
		process.exitCode = 1;
	});

await program.parseAsync(process.argv);
