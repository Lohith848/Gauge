import type { BatteryReport, CapacityPoint, UsagePeriod, DrainEntry, PowerStateEntry } from '../report/types';

export type BatteryVerdict = 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Replace Soon' | 'Unavailable';
export interface Analysis {
  healthPercent: number | null;
  verdict: BatteryVerdict;
  designMwh: number | null;
  fullChargeMwh: number | null;
  capacityLostMwh: number | null;
  lossPercent: number | null;
  trend: 'Increasing' | 'Declining' | 'Stable' | 'Unavailable';
  capacity: CapacityPoint[];
  usage: UsagePeriod[];
  drains: DrainEntry[];
  runtimeHours: number | null;
  latestRuntimeSec: number | null;
  averageRuntimeSec: number | null;
  designRuntimeSec: number | null;
  fullChargeRuntimeSec: number | null;
  batteryActiveHours: number | null;
  batteryStandbyHours: number | null;
  acActiveHours: number | null;
  acStandbyHours: number | null;
  batteryShare: number | null;
  observations: string[];
  recentDays: { date: string; label: string; batteryPercent: number | null; pluggedPercent: number | null }[];
  latestReading: PowerStateEntry | null;
  cycleCount: number | null;
  recentUsage: PowerStateEntry[];
}

const hours = (seconds: number | null): number | null => seconds === null ? null : seconds / 3600;
const totalHours = (periods: UsagePeriod[], source: 'battery' | 'ac', kind: 'activeSec' | 'standbySec') => {
  const values = periods.map((period) => period[source][kind]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / 3600 : null;
};
const statusFor = (health: number | null): BatteryVerdict => {
  if (health === null) return 'Unavailable';
  if (health >= 95) return 'Excellent';
  if (health >= 90) return 'Very Good';
  if (health >= 80) return 'Good';
  if (health >= 70) return 'Fair';
  if (health >= 60) return 'Poor';
  return 'Replace Soon';
};

export function analyze(report: BatteryReport): Analysis {
  const battery = report.batteries[0];
  const capacity = [...report.capacityHistory].sort((a, b) => a.start.localeCompare(b.start));
  const latestCapacity = [...capacity].reverse().find((point) => point.fullChargeMwh !== null);
  const designMwh = battery?.designCapacityMwh ?? latestCapacity?.designMwh ?? null;
  const fullChargeMwh = battery?.fullChargeCapacityMwh ?? latestCapacity?.fullChargeMwh ?? null;
  const healthExact = designMwh !== null && designMwh > 0 && fullChargeMwh !== null ? fullChargeMwh / designMwh * 100 : null;
  const healthPercent = healthExact === null ? null : Math.round(healthExact);
  const capacityLostMwh = designMwh !== null && fullChargeMwh !== null ? designMwh - fullChargeMwh : null;
  const lossPercent = designMwh !== null && designMwh > 0 && capacityLostMwh !== null ? capacityLostMwh / designMwh * 100 : null;
  const historyValues = capacity.map((point) => point.fullChargeMwh).filter((value): value is number => value !== null);
  const trend = historyValues.length < 2 ? 'Unavailable' : historyValues.at(-1)! < historyValues[0]! ? 'Declining' : historyValues.at(-1)! > historyValues[0]! ? 'Increasing' : 'Stable';
  const usage = [...report.usageHistory].sort((a, b) => a.start.localeCompare(b.start));
  const batteryActiveHours = totalHours(usage, 'battery', 'activeSec');
  const batteryStandbyHours = totalHours(usage, 'battery', 'standbySec');
  const acActiveHours = totalHours(usage, 'ac', 'activeSec');
  const acStandbyHours = totalHours(usage, 'ac', 'standbySec');
  const activeTotal = (batteryActiveHours ?? 0) + (acActiveHours ?? 0);
  const batteryShare = activeTotal > 0 && batteryActiveHours !== null && acActiveHours !== null ? batteryActiveHours / activeTotal * 100 : null;
  const drains = report.drainHistory.filter((entry) => entry.state === 'active' && entry.drainedMwh !== null && entry.durationSec > 0);
  const runtimeRows = report.runtimeEstimates.filter((row) => row.atFullCharge.activeSec !== null).sort((a, b) => a.start.localeCompare(b.start));
  const runtimeSeconds = runtimeRows.map((row) => row.atFullCharge.activeSec!).filter(Number.isFinite);
  const latestRuntimeSec = runtimeSeconds.at(-1) ?? null;
  const averageRuntimeSec = runtimeSeconds.length ? runtimeSeconds.reduce((sum, value) => sum + value, 0) / runtimeSeconds.length : null;
  const fullChargeRuntimeSec = latestRuntimeSec ?? report.runtimeSinceInstall?.atFullCharge.activeSec ?? null;
  const designRuntimeSec = [...runtimeRows].reverse().find((row) => row.atDesignCapacity.activeSec !== null)?.atDesignCapacity.activeSec ?? report.runtimeSinceInstall?.atDesignCapacity.activeSec ?? null;
  const runtimeHours = hours(fullChargeRuntimeSec);
  const sortedRecent = [...report.recentUsage].sort((a, b) => a.start.localeCompare(b.start));
  const latestReading = sortedRecent.at(-1) ?? null;

  // Allocate each measured interval to its reported power source, using the next event timestamp as its end.
  const secondsByDay = new Map<string, { battery: number; ac: number }>();
  for (let index = 0; index < sortedRecent.length - 1; index += 1) {
    const entry = sortedRecent[index]!;
    if (entry.source === 'unknown') continue;
    const start = Date.parse(entry.start);
    const end = Date.parse(sortedRecent[index + 1]!.start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const date = entry.start.slice(0, 10);
    const record = secondsByDay.get(date) ?? { battery: 0, ac: 0 };
    record[entry.source] += (end - start) / 1000;
    secondsByDay.set(date, record);
  }
  const recentDays = Array.from(secondsByDay.entries()).slice(-7).map(([date, seconds]) => {
    const total = seconds.battery + seconds.ac;
    return { date, label: new Date(`${date}T12:00:00`).toLocaleDateString('en', { weekday: 'short' }), batteryPercent: total ? Math.round(seconds.battery / total * 100) : null, pluggedPercent: total ? Math.round(seconds.ac / total * 100) : null };
  });
  const observations: string[] = [];
  if (healthPercent !== null) observations.push(`Battery health is ${healthPercent}% (${statusFor(healthPercent)}).`);
  if (capacityLostMwh !== null && lossPercent !== null) observations.push(`${Math.round(capacityLostMwh)} mWh of design capacity is unavailable (${lossPercent.toFixed(1)}%).`);
  if (trend !== 'Unavailable') observations.push(`Recorded full-charge capacity is ${trend.toLowerCase()} across the available history.`);
  if (batteryShare !== null) observations.push(`${Math.round(batteryShare)}% of recorded active time was on battery power.`);
  if (!observations.length) observations.push('Some information is unavailable in this report.');
  return {
    healthPercent, verdict: statusFor(healthPercent), designMwh, fullChargeMwh, capacityLostMwh, lossPercent,
    trend, capacity, usage, drains, runtimeHours, latestRuntimeSec, averageRuntimeSec,
    designRuntimeSec, fullChargeRuntimeSec, batteryActiveHours, batteryStandbyHours, acActiveHours, acStandbyHours,
    batteryShare, observations, recentDays, latestReading, cycleCount: battery?.cycleCount ?? null, recentUsage: sortedRecent,
  };
}
