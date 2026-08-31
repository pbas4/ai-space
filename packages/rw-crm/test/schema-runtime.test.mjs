import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSchema } from '../src/contracts/schema-runtime.mjs';
import { validateWithSchema } from '../src/contracts.mjs';

const schemaNames = [
  'approval-receipt', 'context-envelope', 'engineer-result', 'initial-plan',
  'learning-ledger', 'model-proposal', 'plan-review', 'ui-review', 'context-snapshot',
  'dry-run-report', 'verification-evidence', 'finding'
];
const packageDirectory = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const schemas = Object.fromEntries(await Promise.all(schemaNames.map(async (name) => [
  name,
  JSON.parse(await readFile(join(packageDirectory, 'schemas', `${name}.schema.json`), 'utf8'))
])));

function validValue(schema) {
  if (schema.enum) return schema.enum[0];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((candidate) => candidate !== 'null');
  if (type === 'array') return [];
  if (type === 'object') return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child]) => [key, validValue(child)]));
  if (type === 'integer') return Math.max(schema.minimum ?? 0, 1);
  if (type === 'number') return schema.minimum ?? 0;
  if (type === 'boolean') return false;
  if (schema.format === 'date-time') return '2026-08-26T10:00:00.000Z';
  if (schema.pattern === '^[a-f0-9]{64}$') return 'a'.repeat(64);
  if (schema.pattern) return 'plan:1';
  return 'value'.padEnd(schema.minLength ?? 1, 'x');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function walkSchema(schema, path = [], cases = { required: [], enums: [] }) {
  for (const key of schema.required ?? []) cases.required.push([...path, key]);
  if (schema.enum) cases.enums.push(path);
  for (const [key, child] of Object.entries(schema.properties ?? {})) walkSchema(child, [...path, key], cases);
  return cases;
}

function parentAtPath(value, path) {
  return path.slice(0, -1).reduce((current, key) => current[key], value);
}

function displayPath(path) {
  return `$.${path.join('.')}`;
}

function invalidEnumValue(values) {
  return values.includes('__invalid__') ? '__invalid_2__' : '__invalid__';
}

async function assertContractsRejectSchemaAtLoad(schemaPatch, message) {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'rw-crm-schema-runtime-'));
  const sourceDirectory = join(tempDirectory, 'src');
  const contractsDirectory = join(sourceDirectory, 'contracts');
  const schemaDirectory = join(tempDirectory, 'schemas');
  await Promise.all([mkdir(contractsDirectory, { recursive: true }), mkdir(schemaDirectory, { recursive: true })]);
  await Promise.all([
    writeFile(join(sourceDirectory, 'contracts.mjs'), await readFile(join(packageDirectory, 'src', 'contracts.mjs'))),
    writeFile(join(contractsDirectory, 'schema-runtime.mjs'), await readFile(join(packageDirectory, 'src', 'contracts', 'schema-runtime.mjs'))),
    ...schemaNames.map(async (name) => {
      const schema = clone(schemas[name]);
      if (name === 'approval-receipt') Object.assign(schema, schemaPatch);
      await writeFile(join(schemaDirectory, `${name}.schema.json`), JSON.stringify(schema));
    })
  ]);
  await assert.rejects(import(`${pathToFileURL(join(sourceDirectory, 'contracts.mjs')).href}?${Date.now()}`), message);
}

test('validates required properties, unions, enums, arrays, and patterns', () => {
  const schema = {
    type: 'object', required: ['id', 'status'], properties: {
      id: { type: 'string', minLength: 1, pattern: '^plan:' },
      status: { enum: ['approved', 'rejected'] },
      notes: { type: ['array', 'null'], items: { type: 'string' } }
    }
  };
  assert.deepEqual(validateSchema(schema, { id: 'plan:1', status: 'approved', notes: [] }), { valid: true, errors: [] });
  assert.deepEqual(validateSchema(schema, { id: '', status: 'other', notes: [1] }).errors, [
    '$.id must have length at least 1', '$.id must match ^plan:', '$.status must equal one of approved, rejected', '$.notes[0] must be a string'
  ]);
});

test('validates strict ISO-8601 date-time values', () => {
  const schema = { type: 'string', format: 'date-time' };
  assert.deepEqual(validateSchema(schema, '2026-08-26T10:00:00.000Z'), { valid: true, errors: [] });
  assert.deepEqual(validateSchema(schema, '2026-08-26T10:00:00Z').errors, [
    '$ must be an ISO-8601 timestamp'
  ]);
});

test('delegates package schemas by name', () => {
  assert.deepEqual(
    validateWithSchema('approval-receipt', {
      planId: 'plan:1',
      planHash: 'a'.repeat(64),
      contextSnapshotId: 'b'.repeat(64),
      contextDigest: 'c'.repeat(64),
      approvedBy: 'Pol',
      approvedAt: 'not-a-timestamp'
    }).errors,
    ['$.approvedAt must be an ISO-8601 timestamp']
  );
});

test('rejects one missing required property across every package schema', () => {
  const cases = schemaNames.flatMap((schemaName) => walkSchema(schemas[schemaName]).required.map((path) => ({ schemaName, path })));

  for (const { schemaName, path } of cases) {
    const value = validValue(schemas[schemaName]);
    delete parentAtPath(value, path)[path.at(-1)];
    assert.equal(validateWithSchema(schemaName, value).errors.includes(`${displayPath(path)} is required`), true, `${schemaName}: ${displayPath(path)}`);
  }
});

test('rejects one invalid value for every package schema enum', () => {
  const cases = schemaNames.flatMap((schemaName) => walkSchema(schemas[schemaName]).enums.map((path) => ({ schemaName, path })));

  for (const { schemaName, path } of cases) {
    const value = validValue(schemas[schemaName]);
    const enumSchema = path.reduce((schema, key) => schema.properties[key], schemas[schemaName]);
    parentAtPath(value, path)[path.at(-1)] = invalidEnumValue(enumSchema.enum);
    assert.equal(validateWithSchema(schemaName, value).errors.some((error) => error.startsWith(`${displayPath(path)} must equal one of `)), true, `${schemaName}: ${displayPath(path)}`);
  }
});

test('rejects unsupported schema keywords when contracts load', async () => {
  await assertContractsRejectSchemaAtLoad({ additionalProperties: false }, /Unsupported schema keyword additionalProperties at \$/);
});

test('rejects unsupported schema formats when contracts load', async () => {
  await assertContractsRejectSchemaAtLoad({ properties: { ...schemas['approval-receipt'].properties, approvedAt: { type: 'string', format: 'email' } } }, /Unsupported schema format email at \$.properties.approvedAt/);
});
