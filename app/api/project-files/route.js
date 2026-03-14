import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/project-files?folder=memory|requirements|reports
 * Returns list of files with content (markdown files) or metadata.
 *
 * GET /api/project-files?folder=memory&file=known-bugs.md
 * Returns single file content.
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder');
    const file = url.searchParams.get('file');
    const config = getProjectConfig();
    const workspace = config.project.workspace;

    if (!folder) {
      return Response.json({ ok: false, error: 'folder param required (memory|requirements|reports)' });
    }

    // Resolve folder path
    let dirPath;
    switch (folder) {
      case 'memory':
        dirPath = path.join(workspace, 'memory');
        break;
      case 'requirements':
        dirPath = path.join(workspace, 'requirements');
        break;
      case 'reports':
        dirPath = path.join(workspace, 'reports-md');
        break;
      default:
        return Response.json({ ok: false, error: `Unknown folder: ${folder}` });
    }

    // Resolve symlinks
    try {
      dirPath = fs.realpathSync(dirPath);
    } catch {
      return Response.json({ ok: true, files: [], folder, exists: false });
    }

    if (!fs.existsSync(dirPath)) {
      return Response.json({ ok: true, files: [], folder, exists: false });
    }

    // Single file request
    if (file) {
      const filePath = path.join(dirPath, file);
      // Prevent path traversal — resolve symlinks then check containment
      let realFilePath;
      try {
        realFilePath = fs.realpathSync(filePath);
      } catch {
        return Response.json({ ok: false, error: `File not found: ${file}` });
      }
      const realDirPath = fs.realpathSync(dirPath);
      if (!realFilePath.startsWith(realDirPath + path.sep) &&
          realFilePath !== realDirPath) {
        return Response.json({ ok: false, error: 'Invalid file path' }, { status: 400 });
      }
      if (!fs.existsSync(realFilePath)) {
        return Response.json({ ok: false, error: `File not found: ${file}` });
      }
      const content = fs.readFileSync(realFilePath, 'utf8');
      const stat = fs.statSync(realFilePath);
      return Response.json({
        ok: true,
        file: { name: file, content, size: stat.size, modified: stat.mtime.toISOString() },
      });
    }

    // List all files in folder
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const subDir = path.join(dirPath, entry.name);
        const subFiles = fs.readdirSync(subDir).filter(f => !f.startsWith('.'));
        files.push({
          name: entry.name,
          type: 'directory',
          fileCount: subFiles.length,
          files: subFiles.slice(0, 20), // First 20 filenames
        });
      } else {
        const filePath = path.join(dirPath, entry.name);
        const stat = fs.statSync(filePath);
        const isText = entry.name.endsWith('.md') || entry.name.endsWith('.json') || entry.name.endsWith('.txt');

        const fileInfo = {
          name: entry.name,
          type: 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };

        // Include content for text files under 100KB
        if (isText && stat.size < 100_000) {
          fileInfo.content = fs.readFileSync(filePath, 'utf8');
        }

        files.push(fileInfo);
      }
    }

    return Response.json({ ok: true, folder, files, dirPath });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
