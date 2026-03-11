import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const SESSIONS_INDEX = path.join(SESSIONS_DIR, 'sessions.json');

/**
 * GET /api/session-history?sessionId=xxx[&offset=0][&limit=60]
 *
 * Reads the session JSONL file and returns parsed conversation entries.
 * Supports offset-based polling (returns only new lines since offset).
 *
 * When offset=0 (initial load), returns only the last `limit` entries
 * to avoid sending huge payloads for long-running sessions.
 * Pass limit=0 to disable truncation and get everything.
 *
 * Also supports ?taskId=xxx to auto-resolve the session for a running task.
 */
const DEFAULT_INITIAL_LIMIT = 60;
const DEFAULT_PREVIOUS_LIMIT = 60;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    let sessionId = url.searchParams.get('sessionId');
    const taskId = url.searchParams.get('taskId');
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const beforeParam = url.searchParams.get('before');
    const before = beforeParam !== null ? parseInt(beforeParam, 10) : null;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam !== null
      ? parseInt(limitParam, 10)
      : (before !== null ? DEFAULT_PREVIOUS_LIMIT : DEFAULT_INITIAL_LIMIT);

    // If taskId provided, resolve to sessionId from sessions index
    if (!sessionId && taskId) {
      sessionId = resolveTaskSession(taskId);
    }

    if (!sessionId) {
      return Response.json({ ok: false, error: 'No sessionId or matching taskId', entries: [] });
    }

    const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return Response.json({ ok: true, entries: [], sessionId, nextOffset: 0, fileExists: false });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const totalLines = lines.length;

    // Backward pagination for older history chunks.
    if (before !== null) {
      const safeBefore = Math.max(0, Math.min(before, totalLines));
      const start = limit > 0 ? Math.max(0, safeBefore - limit) : 0;
      const slice = lines.slice(start, safeBefore);
      const entries = [];

      for (const line of slice) {
        try {
          const d = JSON.parse(line);
          const entry = parseSessionEntry(d);
          if (entry) entries.push(entry);
        } catch { /* skip malformed */ }
      }

      return Response.json({
        ok: true,
        sessionId,
        entries,
        nextOffset: totalLines,
        totalLines,
        truncatedHead: start > 0,
        headOffset: start,
        chunkStart: start,
        chunkEnd: safeBefore,
        fileExists: true,
      });
    }

    // For initial load (offset=0), skip to the tail to avoid huge payloads
    let effectiveOffset = offset;
    let truncatedHead = false;
    if (offset === 0 && limit > 0 && totalLines > limit) {
      effectiveOffset = totalLines - limit;
      truncatedHead = true;
    }

    // Only process lines after effectiveOffset
    const newLines = lines.slice(effectiveOffset);
    const entries = [];

    for (const line of newLines) {
      try {
        const d = JSON.parse(line);
        const entry = parseSessionEntry(d);
        if (entry) entries.push(entry);
      } catch { /* skip malformed */ }
    }

    return Response.json({
      ok: true,
      sessionId,
      entries,
      nextOffset: totalLines,
      totalLines,
      truncatedHead,
      headOffset: truncatedHead ? effectiveOffset : 0,
      fileExists: true,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message, entries: [] }, { status: 500 });
  }
}

/** Resolve a task ID to a session ID by searching the sessions index */
function resolveTaskSession(taskId) {
  try {
    if (!fs.existsSync(SESSIONS_INDEX)) return null;
    const data = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));

    // Sessions index is a { key: sessionData } map
    // Look for session keys containing the taskId
    // Common patterns: "agent:main:qa-story-0-..." or labels containing taskId
    const now = Date.now();
    let bestMatch = null;
    let bestAge = Infinity;

    for (const [key, session] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const label = (session.label || '').toLowerCase();
      const taskLower = taskId.toLowerCase();

      // Match by key containing task ID, or label containing task ID
      if (keyLower.includes(taskLower) || label.includes(taskLower)) {
        const age = now - (session.updatedAt || 0);
        if (age < bestAge) {
          bestAge = age;
          bestMatch = session.sessionId || session.id;
        }
      }
    }

    return bestMatch;
  } catch {
    return null;
  }
}

/** Parse a JSONL entry into a display-friendly format */
function parseSessionEntry(d) {
  const base = { id: d.id, timestamp: d.timestamp, parentId: d.parentId };

  switch (d.type) {
    case 'session':
      return { ...base, kind: 'session', cwd: d.cwd, sessionId: d.id };

    case 'model_change':
      return { ...base, kind: 'model_change', provider: d.provider, modelId: d.modelId };

    case 'message': {
      const msg = d.message || {};
      const role = msg.role;
      const content = msg.content;

      if (role === 'user') {
        const text = extractText(content);
        // Skip long system/runtime messages, show the meaningful part
        const cleaned = cleanUserMessage(text);
        return { ...base, kind: 'user_message', text: cleaned };
      }

      if (role === 'assistant') {
        const parts = [];
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === 'text' && c.text) {
              parts.push({ type: 'text', text: c.text });
            } else if (c.type === 'thinking') {
              const full = c.thinking || '';
              if (full) parts.push({ type: 'thinking', text: full.slice(0, 200), fullText: full });
            } else if (c.type === 'tool_use') {
              parts.push({
                type: 'tool_call',
                name: c.name,
                inputPreview: summarizeToolInput(c.name, c.input),
              });
            }
          }
        } else if (typeof content === 'string') {
          parts.push({ type: 'text', text: content });
        }
        if (parts.length === 0) return null;
        return { ...base, kind: 'assistant_message', parts };
      }

      if (role === 'toolResult' || role === 'tool') {
        const toolName = msg.toolName || msg.name || '';
        const text = extractText(msg.content);
        return {
          ...base,
          kind: 'tool_result',
          toolName,
          toolCallId: msg.toolCallId || msg.tool_call_id || '',
          text: text.slice(0, 500), // Truncate long tool results
          truncated: text.length > 500,
        };
      }

      return null;
    }

    case 'custom':
      if (d.customType === 'model-snapshot') {
        const data = d.data || {};
        return { ...base, kind: 'model_snapshot', provider: data.provider, modelId: data.modelId };
      }
      return null;

    default:
      return null;
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return '';
}

function cleanUserMessage(text) {
  // Remove runtime context blocks that are internal
  const cleaned = text
    .replace(/\[.*?\] OpenClaw runtime context \(internal\):[\s\S]*?(?=\n\n|\[dashboard|$)/g, '')
    .replace(/This context is runtime-generated.*?\n/g, '')
    .trim();
  return cleaned || text.slice(0, 300);
}

function summarizeToolInput(name, input) {
  if (!input) return '';
  if (typeof input === 'string') return input.slice(0, 100);

  // Common tool input summaries
  if (name === 'exec' || name === 'bash') {
    return input.command?.slice(0, 120) || JSON.stringify(input).slice(0, 100);
  }
  if (name === 'browser_navigate' || name === 'navigate') {
    return input.url?.slice(0, 120) || '';
  }
  if (name === 'browser_click' || name === 'click') {
    return `Click: ${input.selector || input.element || input.text || ''}`.slice(0, 80);
  }
  if (name === 'browser_type' || name === 'type') {
    return `Type: "${input.text || ''}"`.slice(0, 80);
  }
  if (name === 'browser_snapshot' || name === 'snapshot') {
    return 'Take snapshot';
  }
  if (name === 'sessions_spawn') {
    return `Spawn: ${input.model || ''} ${input.label || ''}`.slice(0, 100);
  }
  if (name === 'sessions_send') {
    return `Send to: ${input.sessionKey || input.session || ''}`.slice(0, 80);
  }
  if (name === 'file_read' || name === 'read_file') {
    return input.path?.slice(0, 100) || '';
  }
  if (name === 'file_write' || name === 'write_file') {
    return input.path?.slice(0, 100) || '';
  }

  // Generic: show first key-value pairs
  const keys = Object.keys(input).slice(0, 3);
  return keys.map(k => {
    const v = input[k];
    const vs = typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60);
    return `${k}: ${vs}`;
  }).join(', ');
}
