import { execFile } from 'child_process';
import { checkGatewayHealth } from '@/lib/openclaw-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/gateway/restart
 * Restarts the OpenClaw gateway via launchctl kickstart.
 * Used by the dashboard watchdog when gateway health checks fail.
 */
export async function POST() {
  try {
    const uid = process.getuid?.();
    if (uid == null) {
      return Response.json({ ok: false, error: 'Cannot determine UID' }, { status: 500 });
    }

    const label = 'ai.openclaw.gateway';
    const domain = `gui/${uid}`;

    // First check if the LaunchAgent is loaded
    const isLoaded = await new Promise((resolve) => {
      execFile('launchctl', ['print', `${domain}/${label}`], { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });

    if (!isLoaded) {
      // Try to bootstrap it
      const plistPath = `${process.env.HOME}/Library/LaunchAgents/${label}.plist`;
      const bootstrapped = await new Promise((resolve) => {
        execFile('launchctl', ['bootstrap', domain, plistPath], { timeout: 5000 }, (err) => {
          resolve(!err);
        });
      });

      if (!bootstrapped) {
        return Response.json({
          ok: false,
          error: 'Gateway LaunchAgent not installed. Run: openclaw gateway install',
        }, { status: 503 });
      }

      // Give it a moment to start
      await new Promise(r => setTimeout(r, 2000));
      const health = await checkGatewayHealth();
      return Response.json({ ok: true, action: 'bootstrapped', health });
    }

    // LaunchAgent is loaded — kickstart it (force restart)
    await new Promise((resolve, reject) => {
      execFile('launchctl', ['kickstart', '-k', `${domain}/${label}`], { timeout: 10000 }, (err) => {
        if (err) reject(new Error(`kickstart failed: ${err.message}`));
        else resolve();
      });
    });

    // Wait for the gateway to come back
    await new Promise(r => setTimeout(r, 2000));
    const health = await checkGatewayHealth();

    return Response.json({ ok: true, action: 'restarted', health });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
