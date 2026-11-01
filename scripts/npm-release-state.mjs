import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

try {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error("Usage: npm-release-state.mjs <package.json>");
  }
  const { name, version } = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof name !== "string" || !name || typeof version !== "string" || !version) {
    throw new Error("Package name and version must be nonempty strings");
  }

  const result = spawnSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
    encoding: "utf8",
  });
  if (result.error || result.signal) {
    throw new Error("npm metadata lookup could not complete");
  }

  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    throw new Error("npm metadata lookup returned invalid JSON");
  }
  if (result.status === 0 && metadata === version) {
    process.stdout.write("published\n");
  } else if (result.status > 0 && metadata?.error?.code === "E404") {
    process.stdout.write("missing\n");
  } else {
    throw new Error("npm metadata lookup did not confirm the exact version or E404");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
