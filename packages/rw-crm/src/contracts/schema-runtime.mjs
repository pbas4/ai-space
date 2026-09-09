const SUPPORTED_KEYWORDS = new Set([
  'type', 'required', 'properties', 'items', 'enum', 'pattern', 'format', 'minLength', 'minimum'
]);

function matchesType(type, value) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function describeTypes(types) {
  return types.map((type) => type === 'array' ? 'an array' : type === 'object' ? 'an object' : `a ${type}`).join(' or ');
}

function isStrictDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function assertSupportedSchema(schema, path = '$') {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) throw new Error(`Unsupported schema keyword ${key} at ${path}`);
  }
  if (schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) assertSupportedSchema(child, `${path}.properties.${key}`);
  }
  if (schema.items) assertSupportedSchema(schema.items, `${path}.items`);
  if (schema.format && schema.format !== 'date-time') throw new Error(`Unsupported schema format ${schema.format} at ${path}`);
}

export function validateSchema(schema, value, path = '$') {
  const errors = [];
  const allowed = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (allowed.length && !allowed.some((type) => matchesType(type, value))) {
    return { valid: false, errors: [`${path} must be ${describeTypes(allowed)}`] };
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must equal one of ${schema.enum.join(', ')}`);
  if (typeof schema.minLength === 'number' && typeof value === 'string' && value.length < schema.minLength) errors.push(`${path} must have length at least ${schema.minLength}`);
  if (schema.pattern && typeof value === 'string' && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path} must match ${schema.pattern}`);
  if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
  if (schema.format === 'date-time' && !isStrictDateTime(value)) errors.push(`${path} must be an ISO-8601 timestamp`);
  if (schema.required && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required) if (!(key in value)) errors.push(`${path}.${key} is required`);
  }
  if (schema.properties && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in value) errors.push(...validateSchema(child, value[key], `${path}.${key}`).errors);
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`).errors));
  }
  return { valid: errors.length === 0, errors };
}
