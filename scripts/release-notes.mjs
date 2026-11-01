import { readFileSync } from "node:fs";

try {
  const [version, changelogPath] = process.argv.slice(2);
  if (!version || !changelogPath) {
    throw new Error("Usage: release-notes.mjs <version> <changelog>");
  }

  // Keep line endings so the release body retains its Markdown spacing.
  const lines = readFileSync(changelogPath, "utf8").split(/(?<=\n)/);
  const headings = lines.flatMap((line, index) =>
    line.trimEnd() === `## ${version}` ? [index] : []
  );
  if (headings.length !== 1) {
    throw new Error(`Expected exactly one changelog heading for ${version}`);
  }

  const start = headings[0] + 1;
  const nextHeading = lines.findIndex(
    (line, index) => index >= start && /^##(?:\s|$)/.test(line)
  );
  const section = lines.slice(start, nextHeading === -1 ? undefined : nextHeading);
  const starts = section.flatMap((line, index) =>
    line.trimEnd() === "<!-- release:start -->" ? [index] : []
  );
  const ends = section.flatMap((line, index) =>
    line.trimEnd() === "<!-- release:end -->" ? [index] : []
  );
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) {
    throw new Error(`Expected one complete release marker pair for ${version}`);
  }

  const body = section.slice(starts[0] + 1, ends[0]).join("");
  if (!body.trim()) {
    throw new Error(`No release notes found for ${version}`);
  }
  process.stdout.write(body);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
