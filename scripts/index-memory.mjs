#!/usr/bin/env node

/**
 * Memory indexer — parses markdown memory files into RuVector collections.
 * Uses RuVector's ONNX embeddings (all-MiniLM-L6-v2, 384d).
 *
 * Usage: pnpm index-memory [projectId]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initOnnxEmbedder, embed as rvEmbed, getDimension } from 'ruvector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function embedText(text) {
  const result = await rvEmbed(text);
  return result.embedding;
}

async function main() {
  const projectId = process.argv[2] || 'ordertu-qa';
  const memoryDir = path.join(ROOT, 'config', projectId, 'memory');
  const ruvectorDir = path.join(memoryDir, 'ruvector');

  console.log(`Indexing memory files for project: ${projectId}`);
  console.log(`Memory dir: ${memoryDir}`);
  console.log(`Vector store: ${ruvectorDir}`);

  if (!fs.existsSync(memoryDir)) {
    console.error(`Memory directory not found: ${memoryDir}`);
    process.exit(1);
  }

  fs.mkdirSync(ruvectorDir, { recursive: true });

  // Initialize RuVector ONNX embedder
  console.log('\nInitializing RuVector ONNX embedder...');
  await initOnnxEmbedder();
  const dim = getDimension();
  console.log(`Embedder ready: ${dim}d\n`);

  let totalIndexed = 0;

  function saveMeta(name, meta) {
    fs.writeFileSync(path.join(ruvectorDir, `${name}.meta.json`), JSON.stringify(meta, null, 2));
  }

  function loadMeta(name) {
    const p = path.join(ruvectorDir, `${name}.meta.json`);
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* fresh */ }
    return { entries: [] };
  }

  async function indexFile(collectionName, filePath, splitRegex, parseEntry) {
    const meta = { entries: [] };

    if (!fs.existsSync(filePath)) {
      console.log(`  ${path.basename(filePath)}: not found, skipping`);
      saveMeta(collectionName, meta);
      return 0;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const blocks = content.split(splitRegex);
    let count = 0;

    for (const block of blocks) {
      const entry = parseEntry(block, count);
      if (!entry) continue;

      const text = entry.text || entry.title || '';
      const vector = await embedText(text);

      meta.entries.push({
        ...entry,
        _vector: vector,
        _indexedAt: new Date().toISOString(),
      });
      count++;
      totalIndexed++;
    }

    saveMeta(collectionName, meta);
    console.log(`  ${path.basename(filePath)}: ${count} entries`);
    return count;
  }

  // --- Index known-bugs.md ---
  await indexFile('bugs', path.join(memoryDir, 'known-bugs.md'), /(?=###\s)/, (block, i) => {
    const titleMatch = block.match(/###\s+(.+)/);
    if (!titleMatch) return null;
    const idMatch = block.match(/\b(S\d+-B\d+)\b/);
    return {
      id: idMatch?.[1] || `bug-${i}`,
      title: titleMatch[1].trim(),
      text: block.trim(),
      source: 'known-bugs.md',
    };
  });

  // --- Index module-notes.md ---
  await indexFile('module-notes', path.join(memoryDir, 'module-notes.md'), /(?=##\s)/, (section) => {
    const titleMatch = section.match(/##\s+(.+)/);
    if (!titleMatch) return null;
    return {
      id: `note-${titleMatch[1].trim().replace(/\s+/g, '-').toLowerCase()}`,
      title: titleMatch[1].trim(),
      text: section.trim(),
      source: 'module-notes.md',
    };
  });

  // --- Index run-log.md ---
  await indexFile('run-history', path.join(memoryDir, 'run-log.md'), /(?=###\s)/, (entry, i) => {
    const titleMatch = entry.match(/###\s+(.+)/);
    if (!titleMatch) return null;
    return {
      id: `run-${i}`,
      title: titleMatch[1].trim(),
      text: entry.trim(),
      source: 'run-log.md',
    };
  });

  // --- Ensure empty metadata files exist for API-only collections ---
  for (const name of ['agent-issues', 'decisions']) {
    const meta = loadMeta(name);
    saveMeta(name, meta);
  }

  console.log(`\nDone. Indexed ${totalIndexed} entries with ${dim}d ONNX embeddings.`);
}

main().catch(e => {
  console.error('Indexing failed:', e.message);
  process.exit(1);
});
