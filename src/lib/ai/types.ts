import type { Analysis } from '../analysis';
import type { BatteryReport } from '../report/types';

export interface AiReport {
  summary: string;
  findings: string[];
  recommendations: string[];
  limitations: string[];
  model: string;
  generatedAt: string;
}

export type AiInputReport = Omit<BatteryReport, 'system' | 'batteries'> & {
  system: Pick<BatteryReport['system'], 'productName' | 'osBuild' | 'platformRole' | 'connectedStandby' | 'reportTime' | 'utcOffsetMinutes'>;
  batteries: Array<Omit<BatteryReport['batteries'][number], 'serialNumber'>>;
};

export interface AiPayload {
  report: AiInputReport;
  analysis: Pick<Analysis,
    'healthPercent' | 'verdict' | 'designMwh' | 'fullChargeMwh' | 'capacityDropPercent' |
    'runtimeHours' | 'batteryActiveHours' | 'acActiveHours' | 'batteryShare' |
    'observations'>;
}
