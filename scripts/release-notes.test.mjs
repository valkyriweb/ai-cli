import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-notes.mjs", import.meta.url));
const changelog = fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));

function extract(version, path = changelog) {
  return spawnSync(process.execPath, [script, version, path], {
    encoding: "utf8",
  });
}

test("real changelog selects current and older release bodies independently", () => {
  const latest = extract("0.4.3");
  assert.equal(latest.status, 0, latest.stderr);
  assert.match(latest.stdout, /Configurable request timeouts/);
  assert.doesNotMatch(latest.stdout, /Model info|Custom OpenAI-compatible providers/);

  const older = extract("0.4.2");
  assert.equal(older.status, 0, older.stderr);
  assert.match(older.stdout, /Model info/);
  assert.doesNotMatch(older.stdout, /Configurable request timeouts|Aspect ratio/);

  const { version } = JSON.parse(
    readFileSync(new URL("../packages/ai-cli/package.json", import.meta.url), "utf8")
  );
  const current = extract(version);
  assert.equal(current.status, 0, current.stderr);
});

test("synthetic sections preserve body bytes and fail closed at version boundaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-release-notes-"));
  const path = join(directory, "CHANGELOG.md");
  const body = "\r\n### Fixed\r\n\r\n- Keep **formatting**.  \r\n\r\n";
  const section = `## 1.2.3\r\n\r\n<!-- release:start -->\r\n${body}<!-- release:end -->\r\n`;
  const next = "## 1.2.2\n<!-- release:start -->\n- Older notes\n<!-- release:end -->\n";
  try {
    writeFileSync(path, `# Changelog\n## Unreleased\n- Future\n${section}${next}`);
    const selected = extract("1.2.3", path);
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.stdout, body);

    const invalid = [
      ["missing exact version", "1.2", section + next],
      ["missing section", "9.9.9", section + next],
      ["empty body", "1.2.3", section.replace(body, "\r\n") + next],
      ["missing start", "1.2.3", section.replace("<!-- release:start -->", "") + next],
      ["end in next section", "1.2.3", section.replace("<!-- release:end -->", "") + next],
      ["duplicate version", "1.2.3", section + section + next],
    ];
    for (const [label, version, source] of invalid) {
      writeFileSync(path, source);
      const result = extract(version, path);
      assert.equal(result.status, 1, label);
      assert.equal(result.stdout, "", label);
      assert.ok(result.stderr.trim(), label);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
