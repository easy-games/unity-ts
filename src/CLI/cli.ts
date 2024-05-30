#!/usr/bin/env node

import build from "CLI/commands/build";
import postTypes from "CLI/commands/postTypes";
import prepareTypes from "CLI/commands/prepareTypes";
import { CLIError } from "CLI/errors/CLIError";
import { COMPILER_VERSION } from "Shared/constants";
import * as yargs from "yargs";

yargs
	// help
	.usage("unity-ts - A TypeScript-to-Luau Compiler for Unity")
	.help("help")
	.alias("h", "help")
	.describe("help", "show help information")

	// version
	.version(COMPILER_VERSION)
	.alias("v", "version")
	.describe("version", "show version information")

	// commands
	.command(build)
	.command(prepareTypes)
	.command(postTypes)

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
