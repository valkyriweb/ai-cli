import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./npm-release-state.mjs", import.meta.url));

test("release admission queries the exact package version and fails closed on uncertainty", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-npm-release-state-"));
  const manifest = join(directory, "package.json");
  const fixture = join(directory, "fixture.json");
  const calls = join(directory, "calls.json");
  writeFileSync(manifest, JSON.stringify({ name: "ai-cli", version: "0.4.3" }));
  // This executable only returns supplied registry responses and records requests.
  // It cannot reach npm, including when a regression asks for latest instead.
  writeFileSync(join(directory, "npm"), `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(process.env.NPM_TEST_FIXTURE, "utf8"));
const args = process.argv.slice(2);
writeFileSync(process.env.NPM_TEST_CALLS, JSON.stringify(args));
if (args[1] === "ai-cli") {
  process.stdout.write(args.includes("--json") ? '"0.5.0"\\n' : "0.5.0\\n");
} else {
  process.stdout.write(fixture.stdout);
  process.stderr.write(fixture.stderr ?? "");
  process.exitCode = fixture.status;
}
`, { mode: 0o755 });

  const cases = [
    ["published despite different latest", { status: 0, stdout: '"0.4.3"\n' }, "published\n"],
    ["verified missing version", { status: 1, stdout: '{"error":{"code":"E404"}}\n' }, "missing\n"],
    ["authentication error", { status: 1, stdout: '{"error":{"code":"E401"}}\n' }, null],
    ["network error", { status: 1, stdout: '{"error":{"code":"ENOTFOUND"}}\n' }, null],
    ["non-JSON response", { status: 0, stdout: "0.4.3\n" }, null],
    ["wrong exact version", { status: 0, stdout: '"0.5.0"\n' }, null],
    ["ambiguous versions", { status: 0, stdout: '["0.4.3","0.5.0"]\n' }, null],
    ["unverified E404 text", { status: 1, stdout: "", stderr: "npm error code E404\n" }, null],
    ["successful error payload", { status: 0, stdout: '{"error":{"code":"E404"}}\n' }, null],
    ["failed success payload", { status: 1, stdout: '"0.4.3"\n' }, null],
  ];
  try {
    for (const [label, response, expected] of cases) {
      writeFileSync(fixture, JSON.stringify(response));
      const result = spawnSync(process.execPath, [script, manifest], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          NPM_TEST_FIXTURE: fixture,
          NPM_TEST_CALLS: calls,
        },
      });
      assert.equal(result.status, expected === null ? 1 : 0, `${label}: ${result.stderr}`);
      assert.equal(result.stdout, expected ?? "", label);
      assert.deepEqual(JSON.parse(readFileSync(calls, "utf8")),
        ["view", "ai-cli@0.4.3", "version", "--json"], label);
      if (expected === null) assert.ok(result.stderr.trim(), label);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
