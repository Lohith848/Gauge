export type LocalDateTime = string;
export type LocalDate = string;
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type PowerSource = 'battery' | 'ac' | 'unknown';
export type PowerState = 'active' | 'connected-standby' | 'suspended' | 'report-generated' | 'other';
export interface SourceMeta { fileName: string; fileSizeBytes: number; format: 'windows-html' | 'windows-xml' }
export interface SystemInfo {
  computerName: string | null; productName: string | null; bios: string | null; osBuild: string | null;
  platformRole: string | null; connectedStandby: string | null; reportTime: LocalDateTime; utcOffsetMinutes: number | null;
}
export interface BatteryInfo {
  index: number; name: string | null; manufacturer: string | null; serialNumber: string | null;
  chemistryRaw: string | null; chemistryFriendly: string | null; designCapacityMwh: number | null;
  fullChargeCapacityMwh: number | null; cycleCount: number | null;
}
export interface PowerStateEntry {
  start: LocalDateTime; state: PowerState; stateLabel: string; source: PowerSource;
  remainingPercent: number | null; remainingMwh: number | null;
}
export interface DrainEntry {
  start: LocalDateTime; state: PowerState; stateLabel: string; durationSec: number;
  drainedPercent: number | null; drainedMwh: number | null; afterGap: boolean;
}
export interface DurationPair { activeSec: number | null; standbySec: number | null }
export interface UsagePeriod { start: LocalDate; end: LocalDate | null; days: number; battery: DurationPair; ac: DurationPair }
export interface CapacityPoint { start: LocalDate; end: LocalDate | null; days: number; fullChargeMwh: number | null; designMwh: number | null }
export interface RuntimeEstimate { durationSec: number | null; pctOfTarget: number | null; targetHours: number | null }
export interface RuntimeEstimatePair { activeSec: number | null; standby: RuntimeEstimate }
export interface RuntimeEstimateRow { start: LocalDate; end: LocalDate | null; days: number; atFullCharge: RuntimeEstimatePair; atDesignCapacity: RuntimeEstimatePair }
export interface ParseWarning { code: string; message: string; section?: string; row?: number }
export interface BatteryReport {
  schemaVersion: 1; source: SourceMeta; system: SystemInfo; batteries: BatteryInfo[];
  recentUsage: PowerStateEntry[]; drainHistory: DrainEntry[]; usageHistory: UsagePeriod[];
  capacityHistory: CapacityPoint[]; runtimeEstimates: RuntimeEstimateRow[];
  runtimeSinceInstall: Omit<RuntimeEstimateRow, 'start' | 'end' | 'days'> | null; warnings: ParseWarning[];
}
export type ParseErrorCode = 'E_EMPTY' | 'E_TOO_LARGE' | 'E_UNSUPPORTED_TYPE' | 'E_UNSUPPORTED_FORMAT' | 'E_NOT_BATTERY_REPORT' | 'E_NO_BATTERY' | 'E_DATE_FORMAT' | 'E_NO_DATA';
export interface ParseError { code: ParseErrorCode; message: string; hint: string }
