/**
 * Hook: validate-result.js
 * Validates result JSON schema after write.
 * Exit 0 = allow, Exit 2 = block
 */

const fs = require('fs');

const REQUIRED_FIELDS = ['status'];
const VALID_STATUSES = ['idle', 'running', 'passed', 'failed', 'done', 'completed', 'cancelled'];

function validate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Result file not found:', filePath);
    process.exit(2);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const field of REQUIRED_FIELDS) {
      if (!(field in data)) {
        console.error(`Missing required field: ${field}`);
        process.exit(2);
      }
    }

    if (data.status && !VALID_STATUSES.includes(data.status)) {
      console.error(`Invalid status: "${data.status}". Expected: ${VALID_STATUSES.join(', ')}`);
      process.exit(2);
    }

    if (data.findings && !Array.isArray(data.findings)) {
      console.error('findings must be an array');
      process.exit(2);
    }

    if (data.passed !== undefined && typeof data.passed !== 'number') {
      console.error('passed must be a number');
      process.exit(2);
    }

    if (data.failed !== undefined && typeof data.failed !== 'number') {
      console.error('failed must be a number');
      process.exit(2);
    }

    console.log('Result validation passed');
    process.exit(0);
  } catch (e) {
    console.error('Result validation error:', e.message);
    process.exit(2);
  }
}

// Run from env or CLI arg
const file = process.env.HOOK_FILE || process.argv[2];
if (file) validate(file);
else { console.log('No file specified, skipping'); process.exit(0); }

module.exports = { validate: (ctx) => {
  if (!ctx.file) return { valid: true };
  try {
    const data = JSON.parse(fs.readFileSync(ctx.file, 'utf8'));
    if (!data.status) return { valid: false, error: 'Missing status field' };
    if (!VALID_STATUSES.includes(data.status)) return { valid: false, error: `Invalid status: ${data.status}` };
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}};
