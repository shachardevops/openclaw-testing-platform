import { NextResponse } from 'next/server';
import { ask, askClaude, askCodex, getAvailableProviders, askWithGatewayFallback, getDirectAIStats, getDirectAIHistory } from '@/lib/direct-ai';
import { validateInput } from '@/lib/security-validator';
import { toErrorResponse, ValidationError, GatewayError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/direct-ai — Provider status, routing stats, and decision history
 */
export async function GET() {
  const providers = getAvailableProviders();
  const stats = getDirectAIStats();
  const history = getDirectAIHistory();
  return NextResponse.json({ ok: true, providers, stats, history });
}

/**
 * POST /api/direct-ai — Send a direct AI prompt (bypasses OpenClaw gateway)
 *
 * Body: {
 *   prompt: string,
 *   provider?: 'claude' | 'codex' | 'auto',
 *   taskType?: 'reasoning' | 'code' | 'auto',
 *   system?: string,
 *   model?: string,
 *   maxTokens?: number,
 *   temperature?: number,
 *   gatewayFallback?: boolean,
 * }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { prompt, provider, taskType, system, model, maxTokens, temperature, gatewayFallback } = body;

    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt is required');
    }

    // Validate known fields
    const validation = validateInput(
      { ...(model ? { model } : {}), ...(prompt ? { message: prompt } : {}) }
    );
    if (!validation.valid) {
      throw new ValidationError('Validation failed');
    }

    const opts = {
      taskType: taskType || 'auto',
      system,
      model,
      maxTokens,
      temperature,
    };

    let result;

    if (provider === 'claude') {
      result = await askClaude(prompt, opts);
    } else if (provider === 'codex') {
      result = await askCodex(prompt, opts);
    } else if (gatewayFallback !== false) {
      result = await askWithGatewayFallback(null, prompt, opts);
      if (result?.choices) {
        result = {
          text: result.choices[0]?.message?.content || '',
          provider: result._provider || 'gateway',
          model: result._model || 'unknown',
          usage: result._usage || null,
        };
      }
    } else {
      result = await ask(prompt, opts);
    }

    if (!result) {
      throw new GatewayError('No AI provider available. Configure API keys in ~/.openclaw/openclaw.json or set ANTHROPIC_API_KEY / OPENAI_API_KEY env vars.');
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
