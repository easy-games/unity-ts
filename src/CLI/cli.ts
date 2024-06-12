#!/usr/bin/env node

import build from "CLI/commands/build";
import { CLIError } from "CLI/errors/CLIError";
import { COMPILER_VERSION } from "Shared/constants";
import * as yargs from "yargs";

yargs
	// help
	.usage("The Typescript Compiler for Airship")
	.help("help")
	.alias("h", "help")
	.describe("help", "show help information")

	// version
	.version(COMPILER_VERSION)
	.alias("v", "version")
	.describe("version", "show version information")

	// commands
	.command("$0", "Build a project", build)
	.command(build)

	// options
	.recommendCommands()
	.strict()
	.wrap(yargs.terminalWidth())

	.parseAsync()
	.catch(e => {
		if (e instanceof CLIError) {
			e.log();
			debugger;
		} else {
			throw e;
		}
	});
