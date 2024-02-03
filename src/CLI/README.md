# unity-ts CLI

This handles the command line interface (CLI) entry point for unity-ts.

The CLI should create Project instances as needed based on input from the user.

Only behavior unique to CLI environments should go here. Any behavior that is common to both the CLI and the playground environments belongs in Project.

## Structure

**commands/** - stores all of the yargs-based subcommands for the cli interface

**commands/build.ts** - the `build` command, this runs by default and can have the following flags:

-   `--project, -p` - Location of the tsconfig.json or folder containing the tsconfig.json _(defaults to ".")_
-   `--watch, -w` - Enable watch mode, recompiles files as they change. Creates a Watcher object. _(defaults to false)_

**cli.ts** - used to kickstart yargs
