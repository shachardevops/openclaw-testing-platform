/**
 * Ruflo CRDT Memory Store — CRDT wrapper for markdown memory files.
 *
 * Parses markdown into sections (each ## heading = entity).
 * LWW per section, OR-Set for adding new sections.
 * Merge on concurrent edits → both edits preserved.
 */

import fs from 'fs';
import path from 'path';
import { LWWRegister, ORSet } from './crdt.js';

const CRDT_SUFFIX = '.crdt.json';

/**
 * Parse markdown into sections by ## headings.
 */
function parseSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let current = null;

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      if (current) sections.push(current);
      current = { heading: match[1].trim(), content: '' };
    } else if (current) {
      current.content += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Rebuild markdown from sections.
 */
function rebuildMarkdown(title, sections) {
  const parts = title ? [`# ${title}\n`] : [];
  for (const section of sections) {
    parts.push(`## ${section.heading}\n${section.content.trimEnd()}\n`);
  }
  return parts.join('\n');
}

/**
 * Read a markdown memory file with CRDT metadata.
 */
export function readMemoryFile(filePath) {
  if (!fs.existsSync(filePath)) return { title: '', sections: [], crdt: null };

  const markdown = fs.readFileSync(filePath, 'utf8');
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const sections = parseSections(markdown);

  // Load CRDT metadata if exists
  const crdtPath = filePath + CRDT_SUFFIX;
  let crdt = null;
  try {
    if (fs.existsSync(crdtPath)) {
      crdt = JSON.parse(fs.readFileSync(crdtPath, 'utf8'));
    }
  } catch { /* no crdt metadata */ }

  return { title, sections, crdt };
}

/**
 * Write (merge) updates to a markdown memory file.
 * @param {string} filePath - Path to .md file
 * @param {Array} updates - [{ heading, content }] sections to add/update
 * @param {string} source - Writer identity
 */
export function writeMemoryFile(filePath, updates, source = 'dashboard') {
  const { title, sections, crdt: existingCrdt } = readMemoryFile(filePath);

  const crdt = existingCrdt || { sections: {}, sectionSet: null };

  // Initialize OR-Set for section tracking
  const sectionSet = ORSet.fromJSON(crdt.sectionSet);

  const sectionMap = new Map();
  for (const s of sections) {
    sectionMap.set(s.heading, s);
  }

  for (const update of updates) {
    const { heading, content } = update;

    // LWW for section content
    const regKey = `section:${heading}`;
    const reg = LWWRegister.fromJSON(crdt.sections[regKey]);
    reg.set(content, source);
    crdt.sections[regKey] = reg.toJSON();

    if (!sectionMap.has(heading)) {
      sectionSet.add(heading, source);
    }

    sectionMap.set(heading, { heading, content });
  }

  crdt.sectionSet = sectionSet.toJSON();

  // Rebuild sections in order (existing order + new sections)
  const orderedSections = [];
  const seen = new Set();
  for (const s of sections) {
    if (sectionMap.has(s.heading)) {
      orderedSections.push(sectionMap.get(s.heading));
      seen.add(s.heading);
    }
  }
  // Add new sections
  for (const heading of sectionSet.values()) {
    if (!seen.has(heading) && sectionMap.has(heading)) {
      orderedSections.push(sectionMap.get(heading));
    }
  }

  // Write markdown
  const markdown = rebuildMarkdown(title, orderedSections);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, markdown);

  // Write CRDT metadata
  fs.writeFileSync(filePath + CRDT_SUFFIX, JSON.stringify(crdt, null, 2));

  return { title, sections: orderedSections };
}
