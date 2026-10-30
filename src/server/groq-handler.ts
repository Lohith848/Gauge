import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AiPayload, AiReport } from '../lib/ai/types.ts';

const MAX_BODY_BYTES = 1_000_000;
const GROQ_TIMEOUT_MS = 45_000;
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const usageByClient = new Map<string, number[]>();
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

type RequestWithBody = IncomingMessage & { body?: unknown; ip?: string };
type GroqErrorBody = { error?: { message?: unknown; type?: unknown; code?: unknown } };
type GroqCompletion = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
};

const REPORT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'battery_report_explanation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        healthAssessment: { type: 'string' },
        capacityExplanation: { type: 'string' },
        usagePattern: { type: 'string' },
        runtimeExplanation: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        limitations: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'summary', 'healthAssessment', 'capacityExplanation', 'usagePattern',
        'runtimeExplanation', 'recommendations', 'limitations',
      ],
      additionalProperties: false,
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Gauge, a careful battery-report explainer. The user JSON contains only metrics calculated in the browser from a Windows battery report; it contains no HTML or device identifiers.

Write a clear, useful report for a non-technical laptop owner. Use plain language, short sentences, and explain what each measured value means. Use only facts present in the JSON. Do not invent readings, diagnose hardware faults, predict lifespan, estimate missing values, or recalculate metrics. Preserve reported units and values. A null value means the report did not provide that measurement.

Return these fields:
- summary: two concise sentences with the overall result and the most useful context.
- healthAssessment: explain the supplied health percentage and verdict in everyday terms. If unavailable, say why.
- capacityExplanation: explain the supplied design, full-charge, capacity-loss, and loss-percent values. Do not infer a value when one is null.
- usagePattern: interpret the supplied battery/AC active and standby hours and battery share. Describe the history as recorded history, not current behavior. Mention the supplied period counts when useful.
- runtimeExplanation: explain latest, average, design-capacity, and full-charge runtime values when present. Clearly call these Windows report estimates, not a live runtime measurement.
- recommendations: give 3 to 5 practical, low-risk tips grounded in these metrics. If the report lacks evidence for a tailored tip, use general battery-care guidance and phrase it as optional. Never claim a tip will restore capacity.
- limitations: list only meaningful missing measurements or short/absent histories from the supplied JSON; use an empty array when none apply.

Keep each explanation to one or two short sentences. Avoid jargon, alarmist language, unsupported causal claims, and repeated numbers. Output only the required JSON object.`;

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
    req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function validPayload(value: unknown): value is AiPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<AiPayload>;
  const allowed = new Set([
    'healthPercent', 'verdict', 'designMwh', 'fullChargeMwh', 'capacityLostMwh', 'lossPercent',
    'cycleCount', 'trend', 'batteryActiveHours', 'batteryStandbyHours', 'acActiveHours',
    'acStandbyHours', 'batteryShare', 'latestRuntimeSec', 'averageRuntimeSec', 'designRuntimeSec',
    'fullChargeRuntimeSec', 'capacityHistoryPeriods', 'usageHistoryPeriods', 'dischargeSessionCount', 'recentUsage',
  ]);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) return false;
  const numbers = [payload.healthPercent, payload.designMwh, payload.fullChargeMwh, payload.capacityLostMwh,
    payload.lossPercent, payload.cycleCount, payload.batteryActiveHours, payload.batteryStandbyHours,
    payload.acActiveHours, payload.acStandbyHours, payload.batteryShare, payload.latestRuntimeSec,
    payload.averageRuntimeSec, payload.designRuntimeSec, payload.fullChargeRuntimeSec];
  const numericValuesValid = numbers.every((number) => number === null || (typeof number === 'number' && Number.isFinite(number)));
  const counts = [payload.capacityHistoryPeriods, payload.usageHistoryPeriods, payload.dischargeSessionCount];
  const countsValid = counts.every((count) => Number.isInteger(count) && (count as number) >= 0);
  return numericValuesValid && countsValid &&
    (payload.healthPercent === null || (payload.healthPercent! >= 0 && payload.healthPercent! <= 100)) &&
    ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Replace Soon', 'Unavailable'].includes(payload.verdict ?? '') &&
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

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function strings(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => cleanText(item, 500)).filter(Boolean);
}

function parseAiReport(content: string): Omit<AiReport, 'model' | 'generatedAt'> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const summary = cleanText(parsed.summary, 700);
  const healthAssessment = cleanText(parsed.healthAssessment, 700);
  const capacityExplanation = cleanText(parsed.capacityExplanation, 700);
  const usagePattern = cleanText(parsed.usagePattern, 700);
  const runtimeExplanation = cleanText(parsed.runtimeExplanation, 700);
  if (!summary || !healthAssessment || !capacityExplanation || !usagePattern || !runtimeExplanation ||
    !Array.isArray(parsed.recommendations) || !Array.isArray(parsed.limitations)) {
    throw new Error('INVALID_AI_OUTPUT');
  }
  return {
    summary,
    healthAssessment,
    capacityExplanation,
    usagePattern,
    runtimeExplanation,
    recommendations: strings(parsed.recommendations),
    limitations: strings(parsed.limitations, 8),
  };
}

async function providerError(response: Response): Promise<{ message: string; code: string }> {
  try {
    const body = await response.json() as GroqErrorBody;
    return {
      message: typeof body.error?.message === 'string' ? body.error.message : '',
      code: typeof body.error?.code === 'string' ? body.error.code : typeof body.error?.type === 'string' ? body.error.type : '',
    };
  } catch {
    return { message: '', code: '' };
  }
}

function isModelError(error: { message: string; code: string }): boolean {
  return /model.{0,30}(deprecat|retir|not found|does not exist|not available|unsupported|not supported)|(?:deprecat|retir|unsupported).{0,30}model|json.?schema.{0,30}(unsupported|not supported)/i.test(`${error.code} ${error.message}`);
}

function canRetryWithDefaultModel(response: Response, error: { message: string; code: string }, model: string): boolean {
  if (model === DEFAULT_MODEL) return false;
  if (response.status === 404) return true;
  return (response.status === 400 || response.status === 403) && isModelError(error);
}

function userFacingGroqError(response: Response, error: { message: string; code: string }, model: string): string {
  if (response.status === 401 || (response.status === 403 && !isModelError(error))) return 'Groq rejected the server API key. Check GROQ_API_KEY in the production Vercel environment, then redeploy.';
  if (response.status === 429) return 'Groq is rate limiting requests. Wait a little and try the analysis again.';
  if (response.status >= 500) return 'Groq is temporarily unavailable. Try the analysis again shortly.';
  if (isModelError(error)) {
    return `The configured Groq model “${model}” is unavailable. Remove GROQ_MODEL or set it to ${DEFAULT_MODEL}.`;
  }
  return `Groq rejected the analysis request (HTTP ${response.status}). Check the production model setting and try again.`;
}

async function requestCompletion(payload: AiPayload, apiKey: string, model: string, signal: AbortSignal): Promise<Response> {
  return await globalThis.fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning_effort: 'medium',
      max_completion_tokens: 2_600,
      response_format: REPORT_SCHEMA,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
    signal,
  });
}

export async function handleGroqRequest(req: RequestWithBody, res: ServerResponse, apiKey = process.env.GROQ_API_KEY, configuredModel = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Use POST to request an analysis.' });
  const serverApiKey = apiKey?.trim();
  if (!serverApiKey) return respond(res, 503, { error: 'Groq is not configured. Add GROQ_API_KEY to the server environment.' });
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
    const signal = AbortSignal.timeout(GROQ_TIMEOUT_MS);
    let model = configuredModel;
    let response = await requestCompletion(payload, serverApiKey, model, signal);
    if (!response.ok) {
      let error = await providerError(response);
      if (canRetryWithDefaultModel(response, error, model)) {
        console.warn('[api/analyze] Configured Groq model unavailable; retrying with supported default', { status: response.status });
        model = DEFAULT_MODEL;
        response = await requestCompletion(payload, serverApiKey, model, signal);
        if (!response.ok) error = await providerError(response);
      }
      if (!response.ok) {
        console.error('[api/analyze] Groq request failed', { status: response.status, code: error.code || undefined });
        return respond(res, response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 503 : 502, {
          error: userFacingGroqError(response, error, model),
        });
      }
    }
    const completion = await response.json() as GroqCompletion;
    const message = completion.choices?.[0]?.message;
    const content = message?.content;
    if (!content) {
      const refusal = cleanText(message?.refusal, 250);
      console.error('[api/analyze] Groq returned no report content', { refused: !!refusal });
      return respond(res, 502, { error: 'Groq returned no battery explanation. Please retry the analysis.' });
    }
    const parsed = parseAiReport(content);
    return respond(res, 200, {
      report: { ...parsed, model: completion.model ?? model, generatedAt: new Date().toISOString() } satisfies AiReport,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_AI_OUTPUT') return respond(res, 502, { error: 'Groq returned an unreadable report. Please try again.' });
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      console.error('[api/analyze] Groq request timed out');
      return respond(res, 504, { error: 'Groq took too long to respond. Your calculated report is ready; try the AI analysis again.' });
    }
    console.error('[api/analyze] Groq request could not be completed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return respond(res, 502, { error: 'The AI service could not be reached. Your calculated battery report is still available.' });
  }
}

