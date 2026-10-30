import type { Analysis } from '../analysis';
import type { PowerStateEntry } from '../report/types';

export interface AiReport {
  summary: string;
  findings: string[];
  recommendations: string[];
  limitations: string[];
  model: string;
  generatedAt: string;
}

/** Aggregate calculations only. No report HTML, raw tables, filenames, or device identifiers. */
export type AiPayload = Omit<Pick<Analysis,
  'healthPercent' | 'verdict' | 'designMwh' | 'fullChargeMwh' | 'capacityLostMwh' |
  'lossPercent' | 'cycleCount' | 'trend' | 'batteryActiveHours' | 'batteryStandbyHours' |
  'acActiveHours' | 'acStandbyHours' | 'latestRuntimeSec' | 'averageRuntimeSec' |
  'designRuntimeSec' | 'fullChargeRuntimeSec' | 'recentUsage'>, 'recentUsage'> & {
    recentUsage: Array<Pick<PowerStateEntry, 'start' | 'state' | 'source' | 'remainingPercent' | 'remainingMwh'>>;
  };
