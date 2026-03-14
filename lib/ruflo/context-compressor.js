/**
 * Ruflo Context Compressor — story-aware context generation for agents.
 *
 * Produces compressed context with only relevant entries:
 *   - Bugs matching story or module
 *   - Module notes for story's target pages
 *   - 3-line run history summary
 *   - Relevant agent issues
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';
import { findSimilarBugs, findRelevantNotes, findRelatedRuns } from './semantic-search.js';
import { getContextCache, setContextCache } from './context-cache.js';

function getMemoryDir() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory');
  }
}

/**
 * Extract bugs relevant to a story from known-bugs.md.
 */
function extractRelevantBugs(storyId, memoryDir) {
  try {
    const bugsPath = path.join(memoryDir, 'known-bugs.md');
    if (!fs.existsSync(bugsPath)) return [];

    const content = fs.readFileSync(bugsPath, 'utf8');
    const blocks = content.split(/(?=###\s)/);
    const relevant = [];

    for (const block of blocks) {
      if (!block.trim()) continue;
      // Match story references
      if (block.includes(`Story: ${storyId}`) || block.includes(`story-${storyId.replace('story-', '')}`)) {
        const titleMatch = block.match(/###\s+(.+)/);
        if (titleMatch) {
          relevant.push({
            title: titleMatch[1].trim(),
            summary: block.split('\n').slice(1, 4).join('\n').trim(),
          });
        }
      }
    }

    return relevant;
  } catch {
    return [];
  }
}

/**
 * Extract module notes relevant to a story.
 */
function extractRelevantNotes(storyId, memoryDir) {
  try {
    const notesPath = path.join(memoryDir, 'module-notes.md');
    if (!fs.existsSync(notesPath)) return [];

    const content = fs.readFileSync(notesPath, 'utf8');
    const sections = content.split(/(?=##\s)/);
    const relevant = [];

    // Read story file to find target pages/modules
    const storyPath = path.join(process.cwd(), 'stories', `${storyId}.md`);
    let storyContent = '';
    try {
      if (fs.existsSync(storyPath)) storyContent = fs.readFileSync(storyPath, 'utf8');
    } catch { /* skip */ }

    for (const section of sections) {
      const titleMatch = section.match(/##\s+(.+)/);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim().toLowerCase();

      // Check if module is mentioned in story
      if (storyContent.toLowerCase().includes(title) || title.includes(storyId.replace('story-', ''))) {
        relevant.push({
          module: titleMatch[1].trim(),
          notes: section.split('\n').slice(1, 6).join('\n').trim(),
        });
      }
    }

    return relevant;
  } catch {
    return [];
  }
}

/**
 * Build compressed context for a story.
 */
export async function forStory(storyId, model) {
  // Check cache first
  const cached = getContextCache(storyId);
  if (cached) return cached;

  const memoryDir = getMemoryDir();
  const parts = [];

  // 1. Relevant bugs (direct match)
  const directBugs = extractRelevantBugs(storyId, memoryDir);
  if (directBugs.length > 0) {
    parts.push('## Known Bugs (This Story)');
    for (const bug of directBugs.slice(0, 5)) {
      parts.push(`- ${bug.title}`);
      if (bug.summary) parts.push(`  ${bug.summary}`);
    }
    parts.push('');
  }

  // 2. Semantic search for similar bugs
  try {
    const semanticBugs = await findSimilarBugs(storyId, 3);
    if (semanticBugs.length > 0) {
      parts.push('## Related Bugs (Similar Patterns)');
      for (const bug of semanticBugs) {
        parts.push(`- ${bug.title || bug.text?.slice(0, 80)}`);
      }
      parts.push('');
    }
  } catch { /* semantic search may not be initialized */ }

  // 3. Relevant module notes
  const notes = extractRelevantNotes(storyId, memoryDir);
  if (notes.length > 0) {
    parts.push('## Module Notes');
    for (const note of notes.slice(0, 3)) {
      parts.push(`### ${note.module}`);
      parts.push(note.notes);
      parts.push('');
    }
  }

  // 4. Run history summary
  try {
    const relatedRuns = await findRelatedRuns(storyId, model, 3);
    if (relatedRuns.length > 0) {
      parts.push('## Recent Run History');
      for (const run of relatedRuns) {
        parts.push(`- ${run.title || run.text?.slice(0, 100)}`);
      }
      parts.push('');
    }
  } catch { /* skip */ }

  const context = parts.join('\n');

  // Cache result
  setContextCache(storyId, context);

  return context;
}
