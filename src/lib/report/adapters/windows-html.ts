import { parseHtmlReport } from '../dom';
import type { ReportAdapter } from './types';
export const windowsHtmlAdapter: ReportAdapter = {
  id: 'windows-html',
  canParse: (text) => !/^\s*<\?xml|<BatteryReport[\s>]/i.test(text),
  parse: parseHtmlReport,
};
