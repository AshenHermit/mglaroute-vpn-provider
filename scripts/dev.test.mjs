import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import { pnpm, pnpmSpawnOptions } from "./dev.mjs";

test("dev runner pnpm command spawns successfully", async () => {
  if (process.platform === "win32") {
    assert.ok(
      !/\.(cmd|bat)$/i.test(pnpm),
      "Windows Node refuses to spawn .cmd/.bat without shell; use extensionless pnpm",
    );
  }

  const child = spawn(pnpm, ["--version"], {
    ...pnpmSpawnOptions,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));

  const [code] = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (...args) => resolve(args));
  });

  assert.equal(code, 0, `spawn failed: ${stderr}`);
  assert.match(stdout, /\d+\.\d+\.\d+/);
});
