import type { Analysis } from '../analysis';
import type { BatteryReport } from '../report/types';
import type { AiInputReport, AiPayload, AiReport } from './types';

export function makeAiPayload(report: BatteryReport, analysis: Analysis): AiPayload {
  const { system, batteries, ...reportData } = report;
  const safeSystem = Object.fromEntries(Object.entries(system).filter(([key]) => key !== 'computerName' && key !== 'bios')) as AiInputReport['system'];
  const safeBatteries = batteries.map((battery) => Object.fromEntries(Object.entries(battery).filter(([key]) => key !== 'serialNumber')) as AiInputReport['batteries'][number]);
  const { source, ...safeReportData } = reportData;
  const safeSource = { ...source, fileName: 'local battery report' };
  const {
    healthPercent, verdict, designMwh, fullChargeMwh, capacityDropPercent, runtimeHours,
    batteryActiveHours, acActiveHours, batteryShare, observations,
  } = analysis;
  return {
    report: {
      ...safeReportData,
      source: safeSource,
      system: safeSystem,
      batteries: safeBatteries,
    },
    analysis: {
      healthPercent, verdict, designMwh, fullChargeMwh, capacityDropPercent, runtimeHours,
      batteryActiveHours, acActiveHours, batteryShare, observations,
    },
  };
}

export async function requestAiReport(report: BatteryReport, analysis: Analysis): Promise<AiReport> {
  const response = await globalThis.fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeAiPayload(report, analysis)),
  });
  const body = await response.json() as { error?: string; report?: AiReport };
  if (!response.ok || !body.report) {
    throw new Error(body.error ?? 'The AI analysis could not be completed.');
  }
  return body.report;
}
