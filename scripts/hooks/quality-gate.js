/**
 * Hook: quality-gate.js
 * Rejects finalization if 0 passed tests.
 */

const fs = require('fs');

function checkQuality(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.log('No result file, skipping quality gate');
    process.exit(0);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Only check finalized results
    if (data.status !== 'passed' && data.status !== 'failed') {
      process.exit(0);
    }

    const passed = data.passed || data.summary?.passed || 0;
    const failed = data.failed || data.summary?.failed || 0;
    const total = passed + failed;

    if (total === 0) {
      console.error('Quality gate: No test results found (0 passed, 0 failed)');
      process.exit(2);
    }

    if (passed === 0 && data.status === 'passed') {
      console.error('Quality gate: Status is "passed" but 0 tests passed');
      process.exit(2);
    }

    console.log(`Quality gate passed: ${passed}/${total} tests passed`);
    process.exit(0);
  } catch (e) {
    console.error('Quality gate error:', e.message);
    process.exit(0); // Don't block on errors
  }
}

const file = process.env.HOOK_FILE || process.argv[2];
if (file) checkQuality(file);
else process.exit(0);

module.exports = { validate: (ctx) => {
  if (!ctx.file) return { valid: true };
  try {
    const data = JSON.parse(fs.readFileSync(ctx.file, 'utf8'));
    const passed = data.passed || 0;
    const failed = data.failed || 0;
    if (passed + failed === 0 && (data.status === 'passed' || data.status === 'failed')) {
      return { valid: false, error: 'No test results found' };
    }
    return { valid: true };
  } catch { return { valid: true }; }
}};
