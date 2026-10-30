import type { Analysis } from '../analysis';
import type { PowerStateEntry } from '../report/types';

export interface AiReport {
  summary: string;
  healthAssessment: string;
  capacityExplanation: string;
  usagePattern: string;
  runtimeExplanation: string;
  recommendations: string[];
  limitations: string[];
  model: string;
  generatedAt: string;
}

/** Aggregate calculations only. No report HTML, raw tables, filenames, or device identifiers. */
export type AiPayload = Omit<Pick<Analysis,
  'healthPercent' | 'verdict' | 'designMwh' | 'fullChargeMwh' | 'capacityLostMwh' |
  'lossPercent' | 'cycleCount' | 'trend' | 'batteryActiveHours' | 'batteryStandbyHours' |
  'acActiveHours' | 'acStandbyHours' | 'batteryShare' | 'latestRuntimeSec' | 'averageRuntimeSec' |
  'designRuntimeSec' | 'fullChargeRuntimeSec' | 'recentUsage'>, 'recentUsage'> & {
    capacityHistoryPeriods: number;
    usageHistoryPeriods: number;
    dischargeSessionCount: number;
    recentUsage: Array<Pick<PowerStateEntry, 'start' | 'state' | 'source' | 'remainingPercent' | 'remainingMwh'>>;
  };

