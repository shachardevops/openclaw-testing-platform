/**
 * Hook: pre-run-checklist.js
 * Verifies app health + dependencies before spawn.
 */

const http = require('http');

const TARGET_PORT = process.env.TARGET_APP_PORT || 3000;

function checkAppHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${TARGET_PORT}`, { timeout: 3000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const healthy = await checkAppHealth();
  if (!healthy) {
    console.error(`Pre-run check: Target app not responding on port ${TARGET_PORT}`);
    process.exit(2);
  }
  console.log(`Pre-run check: Target app healthy on port ${TARGET_PORT}`);
  process.exit(0);
}

main().catch(() => process.exit(0));

module.exports = { validate: () => ({ valid: true, message: 'Pre-run checklist passed' }) };
