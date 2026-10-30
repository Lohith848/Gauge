import type { BatteryReport, ParseError, Result, SourceMeta } from '../types';
export interface ReportAdapter {
  id: 'windows-html' | 'windows-xml';
  canParse(text: string): boolean;
  parse(text: string, meta: SourceMeta): Result<BatteryReport, ParseError>;
}
