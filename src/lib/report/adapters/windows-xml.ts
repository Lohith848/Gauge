import { makeParseError } from '../errors';
import type { ReportAdapter } from './types';
export const windowsXmlAdapter: ReportAdapter = {
  id: 'windows-xml',
  canParse: (text) => /^\s*<\?xml|<BatteryReport[\s>]/i.test(text),
  parse: () => ({ ok: false, error: makeParseError('E_UNSUPPORTED_FORMAT') }),
};
