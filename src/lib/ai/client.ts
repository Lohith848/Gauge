import type { Analysis } from '../analysis';
import type { AiPayload, AiReport } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function errorMessage(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['message', 'error', 'detail', 'reason', 'code']) {
    const message = errorMessage(record[key], depth + 1);
    if (message) return message;
  }
  return null;
}

function isAiReport(value: unknown): value is AiReport {
  const report = asRecord(value);
  return !!report && typeof report.summary === 'string' &&
    typeof report.healthAssessment === 'string' &&
    typeof report.capacityExplanation === 'string' &&
    typeof report.usagePattern === 'string' &&
    typeof report.runtimeExplanation === 'string' &&
    Array.isArray(report.recommendations) && report.recommendations.every((item) => typeof item === 'string') &&
    Array.isArray(report.limitations) && report.limitations.every((item) => typeof item === 'string') &&
    typeof report.model === 'string' && typeof report.generatedAt === 'string';
}

export function makeAiPayload(analysis: Analysis): AiPayload {
  const {
    healthPercent, verdict, designMwh, fullChargeMwh, capacityLostMwh, lossPercent, cycleCount, trend,
    batteryActiveHours, batteryStandbyHours, acActiveHours, acStandbyHours, batteryShare, latestRuntimeSec,
    averageRuntimeSec, designRuntimeSec, fullChargeRuntimeSec, capacity, usage, drains, recentUsage,
  } = analysis;
  return {
    healthPercent, verdict, designMwh, fullChargeMwh, capacityLostMwh, lossPercent, cycleCount, trend,
    batteryActiveHours, batteryStandbyHours, acActiveHours, acStandbyHours, batteryShare, latestRuntimeSec,
    averageRuntimeSec, designRuntimeSec, fullChargeRuntimeSec,
    capacityHistoryPeriods: capacity.length,
    usageHistoryPeriods: usage.length,
    dischargeSessionCount: drains.length,
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
  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    throw new Error(`The AI endpoint response could not be read (HTTP ${response.status}). Your calculated battery report is still available.`);
  }
  let body: Record<string, unknown> | null;
  try {
    body = asRecord(JSON.parse(responseText) as unknown);
  } catch {
    const detail = contentType.includes('text/html') || /^\s*<!doctype html|^\s*<html/i.test(responseText)
      ? 'The AI endpoint returned an HTML page instead of JSON.'
      : 'The AI endpoint returned an unreadable response.';
    throw new Error(`${detail} (HTTP ${response.status}). Your calculated battery report is still available.`);
  }

  if (!body) {
    throw new Error(`The AI endpoint returned an invalid response (HTTP ${response.status}). Your calculated battery report is still available.`);
  }
  if (!response.ok || !isAiReport(body.report)) {
    const message = errorMessage(body.error);
    throw new Error(message ?? `The AI analysis could not be completed (HTTP ${response.status}). Your calculated battery report is still available.`);
  }
  return body.report;
}

