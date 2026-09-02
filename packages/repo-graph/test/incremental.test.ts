import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ExitCode } from "../src/domain/diagnostic.js";
import { buildFullIndex } from "../src/indexer/full.js";
import { updateIndex } from "../src/indexer/incremental.js";
import { GraphDatabase } from "../src/storage/database.js";
import { SCHEMA_VERSION } from "../src/storage/schema.js";

async function fixtureRepository(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "repo-graph-incremental-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"));
  await Promise.all([
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "incremental-fixture", private: true }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "src/value.ts"),
      "export const value: number = 1;\n",
    ),
    writeFile(
      path.join(root, "src/index.ts"),
      "import { value } from './value.js';\nexport const doubled = value * 2;\n",
    ),
  ]);
  return root;
}

function rows(database: DatabaseSync, sql: string): unknown[] {
  return database.prepare(sql).all().map((row) => ({ ...row }));
}

function dumpNormalizedGraph(root: string): Record<string, unknown> {
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    readOnly: true,
    allowExtension: false,
  });
  try {
    return {
      metadata: rows(database, "SELECT key, value FROM metadata ORDER BY key"),
      files: rows(database, "SELECT * FROM files ORDER BY path"),
      nodes: rows(database, "SELECT * FROM nodes ORDER BY id"),
      edges: rows(database, `
        SELECT source_id, target_id, kind, confidence, evidence_file,
               start_line, start_column, end_line, end_column,
               diagnostic_code, diagnostic_level, diagnostic_message,
               diagnostic_file
        FROM edges
        ORDER BY evidence_file, start_line, start_column, kind, source_id, target_id
      `),
      diagnostics: rows(database, `
        SELECT code, level, message, file
        FROM diagnostics
        ORDER BY coalesce(file, ''), code, level, message
      `),
    };
  } finally {
    database.close();
  }
}

function metadata(root: string): Record<string, unknown> {
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    readOnly: true,
    allowExtension: false,
  });
  try {
    return Object.fromEntries(
      (database.prepare("SELECT key, value FROM metadata ORDER BY key").all() as Array<{
        key: string;
        value: string;
      }>).map(({ key, value }) => [key, JSON.parse(value) as unknown]),
    );
  } finally {
    database.close();
  }
}

function editMetadata(
  root: string,
  edit: (database: DatabaseSync) => void,
): void {
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    allowExtension: false,
  });
  try {
    edit(database);
  } finally {
    database.close();
  }
}

async function countAtomicRebuilds<T>(operation: () => Promise<T>): Promise<{
  result: T;
  rebuilds: number;
}> {
  const originalCreateAtomic = GraphDatabase.prototype.createAtomic;
  let rebuilds = 0;
  GraphDatabase.prototype.createAtomic = async function (...args) {
    rebuilds += 1;
    return originalCreateAtomic.apply(this, args);
  };
  try {
    return { result: await operation(), rebuilds };
  } finally {
    GraphDatabase.prototype.createAtomic = originalCreateAtomic;
  }
}

const mutations: ReadonlyArray<{
  name: string;
  apply(root: string): Promise<void>;
}> = [
  {
    name: "adding a file",
    apply: (root) => writeFile(
      path.join(root, "src/added.ts"),
      "import { doubled } from './index.js';\nexport const added = doubled + 1;\n",
    ),
  },
  {
    name: "editing an exported signature",
    apply: (root) => writeFile(
      path.join(root, "src/value.ts"),
      "export const value: string = 'one';\n",
    ),
  },
  {
    name: "deleting a file",
    apply: (root) => rm(path.join(root, "src/value.ts")),
  },
  {
    name: "renaming a file",
    apply: async (root) => {
      await rename(
        path.join(root, "src/value.ts"),
        path.join(root, "src/renamed.ts"),
      );
      await writeFile(
        path.join(root, "src/index.ts"),
        "import { value } from './renamed.js';\nexport const doubled = value * 2;\n",
      );
    },
  },
  {
    name: "changing compiler configuration",
    apply: (root) => writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
  },
];

for (const mutation of mutations) {
  test(`incremental graph equals clean rebuild after ${mutation.name}`, async (t) => {
    const root = await fixtureRepository(t);
    assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
    await mutation.apply(root);

    const updated = await updateIndex(root, { format: "json" });

    assert.equal(updated.ok, true);
    if (updated.ok) assert.equal(updated.value.reused, false);
    const incremental = dumpNormalizedGraph(root);
    await rm(path.join(root, ".repo-graph"), { recursive: true, force: true });
    assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
    assert.deepEqual(incremental, dumpNormalizedGraph(root));
  });
}

test("reuses an unchanged complete index without replacing it", async (t) => {
  const root = await fixtureRepository(t);
  const initial = await buildFullIndex(root, { format: "json" });
  assert.equal(initial.ok, true);
  assert.deepEqual(initial.diagnostics, []);
  const before = await readFile(path.join(root, ".repo-graph/index.sqlite"));

  const { result, rebuilds } = await countAtomicRebuilds(() =>
    updateIndex(root, { format: "json" })
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.reused, true);
  assert.equal(rebuilds, 0);
  assert.deepEqual(
    await readFile(path.join(root, ".repo-graph/index.sqlite")),
    before,
  );
});

test("invalidates reuse for schema, compiler, and tool version changes", async (t) => {
  for (const [key, staleValue] of [
    ["schemaVersion", SCHEMA_VERSION + 1],
    ["compilerVersion", "0.0.0-stale"],
    ["toolVersion", "0.0.0-stale"],
  ] as const) {
    await t.test(key, async (t) => {
      const root = await fixtureRepository(t);
      assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
      const expectedValue = metadata(root)[key];
      editMetadata(root, (database) => {
        database.prepare("UPDATE metadata SET value = ? WHERE key = ?").run(
          JSON.stringify(staleValue),
          key,
        );
      });

      const { result, rebuilds } = await countAtomicRebuilds(() =>
        updateIndex(root, { format: "json" })
      );

      assert.equal(result.ok, true);
      assert.equal(rebuilds, 1);
      assert.equal(metadata(root)[key], expectedValue);
    });
  }
});

test("invalidates reuse when a transitive config changes path aliases", async (t) => {
  const root = await fixtureRepository(t);
  await mkdir(path.join(root, "config"));
  await Promise.all([
    writeFile(
      path.join(root, "config/base.json"),
      `${JSON.stringify({ compilerOptions: { paths: { "@value": ["../src/value.ts"] } } }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ extends: "./config/base.json", compilerOptions: { module: "CommonJS", moduleResolution: "Node", ignoreDeprecations: "6.0" }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "src/other.ts"),
      "export const value: number = 2;\n",
    ),
    writeFile(
      path.join(root, "src/index.ts"),
      "import { value } from '@value';\nexport const doubled = value * 2;\n",
    ),
  ]);
  const initial = await buildFullIndex(root, { format: "json" });
  assert.equal(initial.ok, true);
  assert.deepEqual(initial.diagnostics, []);
  await writeFile(
    path.join(root, "config/base.json"),
    `${JSON.stringify({ compilerOptions: { paths: { "@value": ["../src/other.ts"] } } }, null, 2)}\n`,
  );

  const updated = await updateIndex(root, { format: "json" });

  assert.equal(updated.ok, true);
  const incremental = dumpNormalizedGraph(root);
  await rm(path.join(root, ".repo-graph"), { recursive: true, force: true });
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  assert.deepEqual(incremental, dumpNormalizedGraph(root));
});

test("invalidates reuse when an imported JSON module changes", async (t) => {
  const root = await fixtureRepository(t);
  await Promise.all([
    writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true, module: "CommonJS", moduleResolution: "Node", resolveJsonModule: true, esModuleInterop: true, ignoreDeprecations: "6.0" }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(path.join(root, "src/data.json"), "{\"value\": 1}\n"),
    writeFile(
      path.join(root, "src/index.ts"),
      "import data from './data.json';\nexport const doubled = data.value * 2;\n",
    ),
  ]);
  const initial = await buildFullIndex(root, { format: "json" });
  assert.equal(initial.ok, true);
  assert.deepEqual(initial.diagnostics, []);
  await writeFile(path.join(root, "src/data.json"), "{\"value\": 2}\n");

  const { result, rebuilds } = await countAtomicRebuilds(() =>
    updateIndex(root, { format: "json" })
  );

  assert.equal(result.ok, true);
  assert.equal(rebuilds, 1);
});

test("falls back to a full rebuild for corrupt or incomplete metadata", async (t) => {
  for (const [name, corrupt] of [
    ["incomplete index", (database: DatabaseSync) => {
      database.prepare("UPDATE metadata SET value = 'false' WHERE key = 'complete'").run();
    }],
    ["missing fingerprint field", (database: DatabaseSync) => {
      database.prepare("DELETE FROM metadata WHERE key = 'contentHash'").run();
    }],
    ["invalid metadata encoding", (database: DatabaseSync) => {
      database.prepare("UPDATE metadata SET value = ? WHERE key = 'toolVersion'").run(
        "not-json",
      );
    }],
  ] as const) {
    await t.test(name, async (t) => {
      const root = await fixtureRepository(t);
      assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
      editMetadata(root, corrupt);

      const { result, rebuilds } = await countAtomicRebuilds(() =>
        updateIndex(root, { format: "json" })
      );

      assert.equal(result.ok, true);
      assert.equal(rebuilds, 1);
      assert.equal(metadata(root).complete, true);
    });
  }
});

test("failed incremental replacement preserves the previous readable index", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  const indexPath = path.join(root, ".repo-graph/index.sqlite");
  const previous = await readFile(indexPath);
  await writeFile(path.join(root, "src/value.ts"), "export const value = 2;\n");
  const originalCreateAtomic = GraphDatabase.prototype.createAtomic;
  GraphDatabase.prototype.createAtomic = async () => ({
    ok: false,
    exitCode: ExitCode.InternalFailure,
    diagnostics: [{
      code: "INJECTED_STORAGE_FAILURE",
      level: "error",
      message: "Injected storage failure.",
    }],
  });
  t.after(() => {
    GraphDatabase.prototype.createAtomic = originalCreateAtomic;
  });

  const updated = await updateIndex(root, { format: "json" });

  assert.equal(updated.ok, false);
  if (!updated.ok) {
    assert.equal(updated.diagnostics[0]?.code, "INJECTED_STORAGE_FAILURE");
  }
  assert.deepEqual(await readFile(indexPath), previous);
  const database = new GraphDatabase();
  const opened = await database.openExisting({
    root,
    dataDir: path.join(root, ".repo-graph"),
  });
  assert.equal(opened.ok, true);
  assert.ok((await database.nodes()).length > 0);
});
