#!/usr/bin/env node

import pkg from "../package.json";
import { registerAudioCommand } from "./commands/audio.js";
import { registerImageCommand } from "./commands/image.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerTextCommand } from "./commands/text.js";
import { registerVideoCommand } from "./commands/video.js";
import { CliUsageError, Command } from "./lib/command.js";
import { safeErrorMessage } from "./lib/redaction.js";

const program = new Command();

program
  .name("ai")
  .description(
    "A tiny, agent-native CLI for generating images, video, audio and text with dead-simple commands, stdin support and predictable artifact outputs"
  )
  .version(pkg.version);

registerTextCommand(program);
registerImageCommand(program);
registerVideoCommand(program);
registerAudioCommand(program);
registerModelsCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliUsageError) {
    if (err.message) process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`Error: ${safeErrorMessage(err)}\n`);
  process.exit(1);
});
