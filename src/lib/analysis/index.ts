import type { BatteryReport, CapacityPoint, UsagePeriod, DrainEntry } from '../report/types';
export interface Analysis {
  healthPercent: number | null; verdict: string; designMwh: number | null; fullChargeMwh: number | null;
  capacityDropPercent: number | null; capacity: CapacityPoint[]; usage: UsagePeriod[]; drains: DrainEntry[];
  runtimeHours: number | null; batteryActiveHours: number; acActiveHours: number; batteryShare: number | null;
  observations: string[]; recentDays: { date: string; label: string; batteryPercent: number | null; pluggedPercent: number | null }[];
}
const hours = (seconds: number | null) => seconds === null ? 0 : seconds / 3600;
export function analyze(report: BatteryReport): Analysis {
  const battery = report.batteries[0];
  const designMwh = battery?.designCapacityMwh ?? null;
  const fullChargeMwh = battery?.fullChargeCapacityMwh ?? null;
  const healthPercent = designMwh && fullChargeMwh !== null ? Math.round(fullChargeMwh / designMwh * 100) : null;
  const capacity = [...report.capacityHistory].sort((a, b) => a.start.localeCompare(b.start));
  const values = capacity.map((point) => point.fullChargeMwh).filter((value): value is number => value !== null);
  const firstCapacity = values[0] ?? fullChargeMwh;
  const capacityDropPercent = firstCapacity && fullChargeMwh !== null ? Math.max(0, Math.round((firstCapacity - fullChargeMwh) / firstCapacity * 100)) : null;
  const usage = [...report.usageHistory].sort((a, b) => a.start.localeCompare(b.start));
  const batteryActiveHours = usage.reduce((sum, period) => sum + hours(period.battery.activeSec), 0);
  const acActiveHours = usage.reduce((sum, period) => sum + hours(period.ac.activeSec), 0);
  const activeTotal = batteryActiveHours + acActiveHours;
  const batteryShare = activeTotal ? Math.round(batteryActiveHours / activeTotal * 100) : null;
  const drains = report.drainHistory.filter((entry) => entry.state === 'active' && entry.drainedMwh !== null && entry.durationSec > 0);
  const rateSamples = drains.map((entry) => entry.drainedMwh! / (entry.durationSec / 3600)).filter((rate) => rate > 0).sort((a, b) => a - b);
  const medianRate = rateSamples.length ? rateSamples[Math.floor(rateSamples.length / 2)]! : null;
  const runtimeHours = medianRate && fullChargeMwh ? fullChargeMwh / medianRate : null;
  const observations: string[] = [];
  if (healthPercent !== null) observations.push(`The battery holds ${healthPercent}% of its original design capacity.`);
  if (capacityDropPercent !== null && capacityDropPercent > 0) observations.push(`Recorded full-charge capacity is down ${capacityDropPercent}% from the earliest history entry.`);
  if (batteryShare !== null) observations.push(`Battery power supplied ${batteryShare}% of recorded active use.`);
  if (runtimeHours !== null) observations.push(`Recent active-use sessions suggest about ${runtimeHours.toFixed(1)} hours from a full charge.`);
  if (!observations.length) observations.push('More report history is needed to find usage patterns.');
  const daily = new Map<string, { battery: number; ac: number }>();
  for (const entry of report.recentUsage) {
    const date = entry.start.slice(0, 10); const current = daily.get(date) ?? { battery: 0, ac: 0 };
    if (entry.source === 'battery') current.battery += 1;
    if (entry.source === 'ac') current.ac += 1;
    daily.set(date, current);
  }
  const recentDays = Array.from(daily.entries()).slice(-7).map(([date, counts]) => {
    const total = counts.battery + counts.ac;
    return { date, label: new Date(`${date}T12:00:00`).toLocaleDateString('en', { weekday: 'short' }), batteryPercent: total ? Math.round(counts.battery / total * 100) : null, pluggedPercent: total ? Math.round(counts.ac / total * 100) : null };
  });
  return { healthPercent, verdict: healthPercent === null ? 'Waiting for capacity data' : healthPercent >= 80 ? 'Battery is in good shape' : healthPercent >= 60 ? 'Battery health is fair' : 'Battery health is low', designMwh, fullChargeMwh, capacityDropPercent, capacity, usage, drains, runtimeHours, batteryActiveHours, acActiveHours, batteryShare, observations, recentDays };
}
