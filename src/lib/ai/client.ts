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
  const response = await globalThis.fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeAiPayload(analysis)),
  });
  const body = await response.json() as { error?: string; report?: AiReport };
  if (!response.ok || !body.report) throw new Error(body.error ?? 'The AI analysis could not be completed.');
  return body.report;
}
