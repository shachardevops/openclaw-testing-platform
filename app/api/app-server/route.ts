import { execFile, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { NextRequest } from 'next/server';
import { targetAppConfig, appLogPath } from '@/lib/config';
import appHealth from '@/lib/app-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-start health monitor on first import
appHealth.start();

// Track the spawned process at module level
let appProcess: ChildProcess | null = null;
let appStatus: 'stopped' | 'starting' | 'running' | 'errored' = 'stopped';
const execFileAsync = promisify(execFile);
const PORT_WAIT_TIMEOUT_MS = 15000;
const PORT_WAIT_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getListeningPids(port: number | undefined): Promise<number[]> {
  if (!port) return [];

  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN']);
    return [...new Set(
      stdout
        .split('\n')
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    )];
  } catch (error: unknown) {
    // lsof exits with code 1 when nothing is listening.
    if ((error as { code?: number })?.code === 1) return [];
    return [];
  }
}

async function waitForPortState(port: number, { expectListening, timeoutMs = PORT_WAIT_TIMEOUT_MS }: { expectListening: boolean; timeoutMs?: number } = { expectListening: true }): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pids = await getListeningPids(port);
    const isListening = pids.length > 0;

    if (expectListening ? isListening : !isListening) {
      return pids;
    }

    await sleep(PORT_WAIT_INTERVAL_MS);
  }

  return await getListeningPids(port);
}

async function syncState(config: { port?: number }): Promise<number[]> {
  if (appProcess && !isPidAlive(appProcess.pid ?? undefined)) {
    appProcess = null;
    if (appStatus !== 'errored') appStatus = 'stopped';
  }

  const listeningPids = await getListeningPids(config?.port);

  if (listeningPids.length > 0) {
    if (appStatus !== 'starting') appStatus = 'running';
  } else if (!appProcess && appStatus !== 'errored') {
    appStatus = 'stopped';
  }

  return listeningPids;
}

function appendLogLine(logFile: string, line: string): void {
  if (!logFile) return;
  fs.appendFileSync(logFile, `${line}\n`);
}

async function terminateTrackedProcess(config: { port?: number }, logFile: string): Promise<void> {
  if (!appProcess) return;

  const pid = appProcess.pid!;
  appendLogLine(logFile, `[${new Date().toISOString()}] Stopping tracked process group ${pid} (SIGTERM)`);

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  const remaining = await waitForPortState(config.port!, { expectListening: false, timeoutMs: 5000 });

  if (remaining.length > 0) {
    appendLogLine(logFile, `[${new Date().toISOString()}] Tracked process did not release port ${config.port}; escalating to SIGKILL`);

    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }

    await waitForPortState(config.port!, { expectListening: false, timeoutMs: 3000 });
  }

  appProcess = null;
}

async function terminatePortListeners(config: { port?: number }, logFile: string): Promise<boolean> {
  const pids = await getListeningPids(config.port);

  for (const pid of pids) {
    appendLogLine(logFile, `[${new Date().toISOString()}] Stopping listener on port ${config.port}: pid ${pid} (SIGTERM)`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  let remaining = await waitForPortState(config.port!, { expectListening: false, timeoutMs: 5000 });

  for (const pid of remaining) {
    appendLogLine(logFile, `[${new Date().toISOString()}] Listener on port ${config.port} survived SIGTERM: pid ${pid} (SIGKILL)`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  remaining = await waitForPortState(config.port!, { expectListening: false, timeoutMs: 3000 });
  return remaining.length === 0;
}

async function stopApp(config: { port?: number }, logFile: string): Promise<boolean> {
  await terminateTrackedProcess(config, logFile);
  const released = await terminatePortListeners(config, logFile);
  appStatus = released ? 'stopped' : 'errored';
  return released;
}

export async function GET() {
  const config = targetAppConfig();
  if (!config) {
    return Response.json({ ok: false, error: 'No targetApp configured' }, { status: 400 });
  }

  const listeningPids = await syncState(config);
  const health = appHealth.getStatus();

  return Response.json({
    ok: true,
    status: appStatus,
    healthy: health.healthy,
    pid: appProcess?.pid || null,
    listenerPids: listeningPids,
    name: config.name,
    port: config.port,
    path: config.path,
  });
}

export async function POST(request: NextRequest) {
  const config = targetAppConfig();
  if (!config) {
    return Response.json({ ok: false, error: 'No targetApp configured' }, { status: 400 });
  }

  const { action } = await request.json() as { action: string };

  if (action === 'start') {
    const listeningPids = await syncState(config);
    if (appProcess || listeningPids.length > 0) {
      return Response.json({
        ok: true,
        status: listeningPids.length > 0 ? 'running' : appStatus,
        pid: appProcess?.pid || null,
        listenerPids: listeningPids,
        message: 'Already running',
      });
    }

    const logFile = appLogPath();
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    // Clear previous log
    fs.writeFileSync(logFile, `[${new Date().toISOString()}] Starting ${config.name} (${config.command}) in ${config.path}\n`);

    const logFd = fs.openSync(logFile, 'a');
    const [cmd, ...args] = config.command.split(/\s+/);

    try {
      appProcess = spawn(cmd, args, {
        cwd: config.path,
        stdio: ['ignore', logFd, logFd],
        detached: true,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', PORT: String(config.port || 3000) },
        shell: true,
      });

      fs.closeSync(logFd);
      appStatus = 'starting';

      appProcess.on('error', (err) => {
        fs.appendFileSync(logFile, `\n[ERROR] ${err.message}\n`);
        appStatus = 'errored';
        appProcess = null;
      });

      appProcess.on('exit', (code) => {
        fs.appendFileSync(logFile, `\n[EXIT] Process exited with code ${code}\n`);
        appStatus = 'stopped';
        appProcess = null;
      });

      // After a short delay, mark as running if still alive
      setTimeout(() => {
        if (appProcess && appStatus === 'starting') {
          appStatus = 'running';
        }
      }, 3000);

      const listenerPids = await waitForPortState(config.port!, { expectListening: true, timeoutMs: 8000 });
      if (listenerPids.length > 0) {
        appStatus = 'running';
      }

      return Response.json({ ok: true, status: appStatus, pid: appProcess.pid, listenerPids });
    } catch (e: unknown) {
      fs.closeSync(logFd);
      return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  if (action === 'stop') {
    const logFile = appLogPath();
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const listeningPids = await syncState(config);

    if (!appProcess && listeningPids.length === 0) {
      appStatus = 'stopped';
      return Response.json({ ok: true, status: 'stopped', message: 'Not running' });
    }

    appendLogLine(logFile, '');
    appendLogLine(logFile, `[${new Date().toISOString()}] Stopping ${config.name}`);
    const released = await stopApp(config, logFile);
    return Response.json({ ok: released, status: released ? 'stopped' : 'errored' });
  }

  if (action === 'restart') {
    const logFile = appLogPath();
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    appendLogLine(logFile, '');
    appendLogLine(logFile, `[${new Date().toISOString()}] Restarting ${config.name}`);

    const released = await stopApp(config, logFile);
    if (!released) {
      return Response.json({ ok: false, status: 'errored', error: `Port ${config.port} is still busy after stop attempt` }, { status: 500 });
    }

    // Delegate to start
    const startReq = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    return POST(startReq as NextRequest);
  }

  return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
