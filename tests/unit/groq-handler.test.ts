// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import analyzeHandler from '../../api/analyze';
import { handleGroqRequest } from '../../src/server/groq-handler';

const payload = {
  healthPercent: 82,
  verdict: 'Good',
  designMwh: 55_997,
  fullChargeMwh: 46_088,
  capacityLostMwh: 9_909,
  lossPercent: 17.7,
  cycleCount: null,
  trend: 'Declining',
  batteryActiveHours: 957.7,
  batteryStandbyHours: 12.2,
  acActiveHours: 1_080.4,
  acStandbyHours: 3.1,
  batteryShare: 47,
  latestRuntimeSec: 4_080,
  averageRuntimeSec: 7_740,
  designRuntimeSec: 4_920,
  fullChargeRuntimeSec: 4_080,
  capacityHistoryPeriods: 52,
  usageHistoryPeriods: 52,
  dischargeSessionCount: 11,
  recentUsage: [{ start: '2026-10-26T18:47:43', state: 'report-generated', source: 'ac', remainingPercent: 43, remainingMwh: 19_817 }],
};

const aiContent = {
  summary: 'The report measures battery health at 82%, rated Good. It also records 52 capacity periods and a declining capacity trend.',
  healthAssessment: 'The measured 82% health is in the Good range reported by Gauge.',
  capacityExplanation: 'The battery was designed for 55,997 mWh and most recently recorded 46,088 mWh at full charge, a measured loss of 9,909 mWh (17.7%).',
  usagePattern: 'The report records 957.7 active hours on battery and 1,080.4 on AC across 52 usage periods. Battery power accounted for 47% of active time.',
  runtimeExplanation: 'Windows estimates 1 h 8 min at full charge in the latest estimate; the average reported estimate is 2 h 9 min. These are report estimates, not live readings.',
  recommendations: ['Use Battery Saver when you need to extend a session.', 'Lower screen brightness when it is comfortable to do so.'],
  limitations: ['This report does not include a cycle count.'],
};

let sequence = 0;
function request(body: unknown = payload): IncomingMessage {
  return {
    method: 'POST',
    headers: { origin: 'https://gauge.example', host: 'gauge.example' },
    body,
    ip: `test-client-${++sequence}`,
  } as unknown as IncomingMessage;
}

function response() {
  const result: { statusCode: number; headers: Record<string, string>; body: string } = { statusCode: 200, headers: {}, body: '' };
  const stream = {
    get statusCode() { return result.statusCode; },
    set statusCode(value: number) { result.statusCode = value; },
    setHeader(name: string, value: string) { result.headers[name] = value; },
    end(body: string) { result.body = body; },
  } as unknown as ServerResponse;
  return { stream, result };
}

function successResponse() {
  return new Response(JSON.stringify({ model: 'openai/gpt-oss-120b', choices: [{ message: { content: JSON.stringify(aiContent) } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Groq API boundary', () => {
  it('requests schema-validated explanations using only calculated report values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request(), res.stream, 'server-only-key', 'openai/gpt-oss-120b');

    expect(res.result.statusCode).toBe(200);
    expect(res.result.headers['Content-Type']).toContain('application/json');
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      model: string;
      reasoning_effort: string;
      response_format: { json_schema: { strict: boolean; schema: { required: string[] } } };
      messages: { role: string; content: string }[];
    };
    expect(sent.model).toBe('openai/gpt-oss-120b');
    expect(sent.reasoning_effort).toBe('medium');
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.response_format.json_schema.schema.required).toContain('runtimeExplanation');
    expect(sent.messages[1]!.content).toBe(JSON.stringify(payload));
    expect(sent.messages[1]!.content).not.toContain('<html');
    expect(JSON.parse(res.result.body)).toMatchObject({ report: aiContent });
  });

  it('retries a retired configured model once with the supported default', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'model_decommissioned', message: 'Model is retired.' } }), { status: 400 }))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request(), res.stream, 'server-only-key', 'llama-3.3-70b-versatile');

    expect(res.result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).model).toBe('llama-3.3-70b-versatile');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string).model).toBe('openai/gpt-oss-120b');
    expect(JSON.parse(res.result.body).report.model).toBe('openai/gpt-oss-120b');
  });

  it('returns a JSON timeout response before the Vercel function limit', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('request timed out'), { name: 'TimeoutError' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request(), res.stream, 'server-only-key', 'openai/gpt-oss-120b');

    expect(res.result.statusCode).toBe(504);
    expect(res.result.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('Groq took too long') });
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { messages: { content: string }[] };
    expect(sent.messages[1]!.content).toBe(JSON.stringify(payload));
    expect(sent.messages[1]!.content).not.toContain('<html');
  });

  it('turns an unexpected upstream failure into structured JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    const res = response();

    await expect(handleGroqRequest(request(), res.stream, 'server-only-key', 'openai/gpt-oss-120b')).resolves.toBeUndefined();

    expect(res.result.statusCode).toBe(502);
    expect(res.result.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('AI service could not be reached') });
  });

  it('rejects malformed calculated payloads without contacting Groq', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request({ html: '<html>raw report</html>' }), res.stream, 'server-only-key', 'openai/gpt-oss-120b');

    expect(res.result.statusCode).toBe(400);
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('incomplete or invalid') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the Vercel route response in JSON when the payload is rejected', async () => {
    vi.stubEnv('GROQ_API_KEY', 'server-only-key');
    const res = response();

    await analyzeHandler(request({ html: '<html>raw report</html>' }), res.stream);

    expect(res.result.statusCode).toBe(400);
    expect(res.result.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('incomplete or invalid') });
  });
});

