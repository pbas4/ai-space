import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from '../src/contracts/schema-runtime.mjs';
import { validateWithSchema } from '../src/contracts.mjs';

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
      approvedBy: 'Pol',
      approvedAt: 'not-a-timestamp'
    }).errors,
    ['$.approvedAt must be an ISO-8601 timestamp']
  );
});
