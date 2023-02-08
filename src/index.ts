#!/usr/bin/env node

import { Command } from "commander";
const program = new Command();

/**
 * Set up for pkg-cmd
 */
program
  .command("init")
  .option("-r, --reinitialize", "Reinitialize the project", false)
  .action(require("./cmds/init").default);

/**
 * Format
 */
program.command("format <options>", "Format your files", {
  executableFile: "../bash-cmds/format",
});

/**
 * Lint
 */
program.command("lint <options>", "Run all lint commands", {
  executableFile: "../bash-cmds/lint",
});

program.command(
  "lint:eslint <options>",
  "Statically analyze your code to quickly find problems",
  {
    executableFile: "../bash-cmds/lint:eslint",
  }
);

program.command(
  "lint:alex <options>",
  "Catch insensitive, inconsiderate writing",
  {
    executableFile: "../bash-cmds/lint:alex",
  }
);

/**
 * Test
 */
program.command("test <options>", "Run the test suite", {
  executableFile: "../bash-cmds/test",
});

/**
 * Release
 */
program.command("release <options>", "Release a new version", {
  executableFile: "../bash-cmds/release",
});

program.parse();
