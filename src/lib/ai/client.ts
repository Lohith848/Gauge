import type { Analysis } from '../analysis';
import type { AiPayload, AiReport } from './types';

export function makeAiPayload(analysis: Analysis): AiPayload {
  const {
    healthPercent, verdict, designMwh, fullChargeMwh, capacityLostMwh, lossPercent, cycleCount, trend,
    batteryActiveHours, batteryStandbyHours, acActiveHours, acStandbyHours, latestRuntimeSec,
    averageRuntimeSec, designRuntimeSec, fullChargeRuntimeSec, recentUsage,
  } = analysis;
  return {
    healthPercent, verdict, designMwh, fullChargeMwh, capacityLostMwh, lossPercent, cycleCount, trend,
    batteryActiveHours, batteryStandbyHours, acActiveHours, acStandbyHours, latestRuntimeSec,
    averageRuntimeSec, designRuntimeSec, fullChargeRuntimeSec,
    recentUsage: recentUsage.map(({ start, state, source, remainingPercent, remainingMwh }) => ({
      start, state, source, remainingPercent, remainingMwh,
    })),
  };
}

export async function requestAiReport(analysis: Analysis): Promise<AiReport> {
  let response: Response;
  try {
    response = await globalThis.fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(makeAiPayload(analysis)),
    });
  } catch {
    throw new Error('Could not reach the AI analysis endpoint. Your calculated battery report is still available.');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const responseText = await response.text();
  let body: { error?: string; report?: AiReport };
  try {
    body = JSON.parse(responseText) as { error?: string; report?: AiReport };
  } catch {
    const trimmedResponse = responseText.trimStart().toLowerCase();
    const isHtml = contentType.includes('text/html') || trimmedResponse.startsWith('<!doctype html') || trimmedResponse.startsWith('<html');
    const detail = isHtml
      ? 'The AI endpoint returned an HTML page instead of JSON.'
      : 'The AI endpoint returned an unreadable response.';
    throw new Error(`${detail} (HTTP ${response.status}). Your calculated battery report is still available.`);
  }

  if (!response.ok || !body.report) {
    throw new Error(body.error ?? `The AI analysis could not be completed (HTTP ${response.status}).`);
  }
  return body.report;
}
