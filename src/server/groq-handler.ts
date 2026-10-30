import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AiPayload, AiReport } from '../lib/ai/types.ts';

const MAX_BODY_BYTES = 1_000_000;
const GROQ_TIMEOUT_MS = 45_000;
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const usageByClient = new Map<string, number[]>();

type RequestWithBody = IncomingMessage & { body?: unknown; ip?: string };

function respond(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: RequestWithBody): Promise<string> {
  if (req.body !== undefined) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer | string) => {
      if (tooLarge) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validPayload(value: unknown): value is AiPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<AiPayload>;
  const allowed = new Set([
    'healthPercent', 'verdict', 'designMwh', 'fullChargeMwh', 'capacityLostMwh', 'lossPercent',
    'cycleCount', 'trend', 'batteryActiveHours', 'batteryStandbyHours', 'acActiveHours',
    'acStandbyHours', 'latestRuntimeSec', 'averageRuntimeSec', 'designRuntimeSec',
    'fullChargeRuntimeSec', 'recentUsage',
  ]);
  if (Object.keys(value).length !== allowed.size || Object.keys(value).some((key) => !allowed.has(key))) return false;
  const numbers = [payload.healthPercent, payload.designMwh, payload.fullChargeMwh, payload.capacityLostMwh,
    payload.lossPercent, payload.cycleCount, payload.batteryActiveHours, payload.batteryStandbyHours,
    payload.acActiveHours, payload.acStandbyHours, payload.latestRuntimeSec, payload.averageRuntimeSec,
    payload.designRuntimeSec, payload.fullChargeRuntimeSec];
  const numericValuesValid = numbers.every((number) => number === null || (typeof number === 'number' && Number.isFinite(number)));
  return numericValuesValid && ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Replace Soon', 'Unavailable'].includes(payload.verdict ?? '') &&
    ['Increasing', 'Declining', 'Stable', 'Unavailable'].includes(payload.trend ?? '') &&
    Array.isArray(payload.recentUsage) && payload.recentUsage.length <= 500 &&
    payload.recentUsage.every((entry) => !!entry && typeof entry === 'object' &&
      Object.keys(entry).length === 5 && Object.keys(entry).every((key) => ['start', 'state', 'source', 'remainingPercent', 'remainingMwh'].includes(key)) &&
      typeof entry.start === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(entry.start) &&
      ['active', 'connected-standby', 'suspended', 'report-generated', 'other'].includes(entry.state) &&
      ['battery', 'ac', 'unknown'].includes(entry.source) &&
      (entry.remainingPercent === null || (typeof entry.remainingPercent === 'number' && entry.remainingPercent >= 0 && entry.remainingPercent <= 100)) &&
      (entry.remainingMwh === null || (typeof entry.remainingMwh === 'number' && Number.isFinite(entry.remainingMwh) && entry.remainingMwh >= 0)));
}

function limitExceeded(clientId: string): boolean {
  const now = Date.now();
  const recent = (usageByClient.get(clientId) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 8) return true;
  recent.push(now);
  usageByClient.set(clientId, recent);
  return false;
}

function strings(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 600));
}

function parseAiReport(content: string): Omit<AiReport, 'model' | 'generatedAt'> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error('INVALID_AI_OUTPUT');
  return {
    summary: parsed.summary.slice(0, 800),
    findings: strings(parsed.findings, 4),
    recommendations: strings(parsed.recommendations, 4),
    limitations: strings(parsed.limitations, 4),
  };
}

export async function handleGroqRequest(req: RequestWithBody, res: ServerResponse, apiKey = process.env.GROQ_API_KEY) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Use POST to request an analysis.' });
  if (!apiKey) return respond(res, 503, { error: 'Groq is not configured. Add GROQ_API_KEY to the server environment.' });
  const origin = req.headers.origin;
  const host = req.headers.host;
  try {
    if (origin && host && new URL(origin).host !== host) return respond(res, 403, { error: 'Cross-origin requests are not allowed.' });
  } catch {
    return respond(res, 403, { error: 'Cross-origin requests are not allowed.' });
  }
  const clientId = req.ip ?? req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? 'local';
  if (limitExceeded(clientId)) return respond(res, 429, { error: 'Too many analysis requests. Try again in a minute.' });

  let payload: unknown;
  try {
    const raw = await readBody(req);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return respond(res, 413, { error: 'This report is too large to send for AI analysis.' });
    payload = JSON.parse(raw);
  } catch (error) {
    return respond(res, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'The analysis request was not valid JSON.' });
  }
  if (!validPayload(payload)) return respond(res, 400, { error: 'The calculated analysis is incomplete or invalid.' });

  try {
    const response = await globalThis.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_completion_tokens: 1100,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a battery health expert. Explain the supplied calculated battery metrics in simple language. Give a summary, health assessment, capacity explanation, usage pattern, runtime explanation, and recommendations. The JSON contains calculated values and report-derived recent readings only; it does not contain HTML. Never invent values, estimate capacities, or recalculate metrics. Use only supplied JSON. State when values are missing or history is too short. Return a JSON object with exactly these fields: summary (string), findings (array of strings), recommendations (array of strings), limitations (array of strings).',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[api/analyze] Groq request failed', { status: response.status });
      if (response.status === 429) return respond(res, 429, { error: 'Groq is rate limiting requests. Try again shortly.' });
      return respond(res, 502, { error: `Groq could not complete the analysis (HTTP ${response.status}).` });
    }
    const completion = await response.json() as { choices?: { message?: { content?: string | null } }[]; model?: string };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return respond(res, 502, { error: 'Groq returned an empty analysis.' });
    const parsed = parseAiReport(content);
    return respond(res, 200, { report: { ...parsed, model: completion.model ?? MODEL, generatedAt: new Date().toISOString() } satisfies AiReport });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_AI_OUTPUT') return respond(res, 502, { error: 'Groq returned an unreadable analysis. Please try again.' });
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      console.error('[api/analyze] Groq request timed out');
      return respond(res, 504, { error: 'Groq took too long to respond. Your calculated report is ready; try the AI analysis again.' });
    }
    console.error('[api/analyze] Groq request could not be completed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return respond(res, 502, { error: 'The AI service could not be reached. Your calculated battery report is still available.' });
  }
}
