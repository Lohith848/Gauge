// @vitest-environment node
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  latestRuntimeSec: 4_080,
  averageRuntimeSec: 7_740,
  designRuntimeSec: 4_920,
  fullChargeRuntimeSec: 4_080,
  recentUsage: [{ start: '2026-10-26T18:47:43', state: 'report-generated', source: 'ac', remainingPercent: 43, remainingMwh: 19_817 }],
};

function request(body: unknown = payload): IncomingMessage {
  return {
    method: 'POST',
    headers: { origin: 'https://gauge.example', host: 'gauge.example' },
    body,
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

afterEach(() => vi.unstubAllGlobals());

describe('Groq API boundary', () => {
  it('returns a JSON timeout response before the Vercel function limit', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('request timed out'), { name: 'TimeoutError' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request(), res.stream, 'server-only-key');

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

    await expect(handleGroqRequest(request(), res.stream, 'server-only-key')).resolves.toBeUndefined();

    expect(res.result.statusCode).toBe(502);
    expect(res.result.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('AI service could not be reached') });
  });

  it('rejects malformed calculated payloads without contacting Groq', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await handleGroqRequest(request({ html: '<html>raw report</html>' }), res.stream, 'server-only-key');

    expect(res.result.statusCode).toBe(400);
    expect(JSON.parse(res.result.body)).toMatchObject({ error: expect.stringContaining('incomplete or invalid') });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
