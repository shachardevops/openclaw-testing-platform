#!/usr/bin/env node

/**
 * Migrate existing run-log.md entries into the reasoning bank.
 * Usage: node scripts/migrate-run-log.js [projectId]
 */

import fs from 'fs';
import path from 'path';

async function main() {
  const projectId = process.argv[2] || 'ordertu-qa';
  const memoryDir = path.join(process.cwd(), 'config', projectId, 'memory');
  const runLogPath = path.join(memoryDir, 'run-log.md');

  if (!fs.existsSync(runLogPath)) {
    console.log(`No run-log.md found at ${runLogPath}`);
    return;
  }

  const content = fs.readFileSync(runLogPath, 'utf8');
  const blocks = content.split(/(?=###\s)/);
  let migrated = 0;

  const { default: reasoningBank } = await import('../lib/ruflo/reasoning-bank.js');

  for (const block of blocks) {
    const titleMatch = block.match(/###\s+(.+)/);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const storyMatch = title.match(/story-\d+/i);
    const modelMatch = block.match(/model[:\s]+([^\n,]+)/i);
    const passMatch = block.match(/pass(?:ed)?[:\s]+(\d+)/i);
    const failMatch = block.match(/fail(?:ed)?[:\s]+(\d+)/i);

    reasoningBank.append({
      storyId: storyMatch?.[0] || 'unknown',
      model: modelMatch?.[1]?.trim() || 'unknown',
      result: failMatch?.[1] && parseInt(failMatch[1]) > 0 ? 'failed' : 'passed',
      passed: parseInt(passMatch?.[1] || '0'),
      failed: parseInt(failMatch?.[1] || '0'),
      notes: title,
    });

    migrated++;
  }

  console.log(`Migrated ${migrated} entries from run-log.md`);
}

main().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
