import type { BatteryReport } from '../report/types';
export function reportToCsv(report: BatteryReport): string {
  const lines = [['date', 'full_charge_capacity_mWh', 'design_capacity_mWh'], ...report.capacityHistory.map((point) => [point.start, point.fullChargeMwh ?? '', point.designMwh ?? ''])];
  return lines.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
