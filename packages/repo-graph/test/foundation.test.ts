import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { redactAbsolutePaths } from "../src/domain/diagnostic.js";

test("declares only the approved runtime and build dependencies", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(pkg.dependencies, { typescript: "6.0.3" });
  assert.deepEqual(pkg.devDependencies, { "@types/node": "22.20.1" });
  assert.deepEqual(pkg.bundleDependencies, ["typescript"]);
  assert.equal(pkg.engines.node, ">=22.13.0");
});

test("redacts complete quoted absolute paths containing spaces", () => {
  assert.equal(
    redactAbsolutePaths(
      "Cannot read '/Users/private user/project config/tsconfig.json'.",
    ),
    "Cannot read '[absolute path]'.",
  );
  assert.equal(
    redactAbsolutePaths(
      'Cannot read "C:\\Users\\Private User\\project config\\tsconfig.json".',
    ),
    'Cannot read "[absolute path]".',
  );
});
