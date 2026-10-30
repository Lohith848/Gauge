import { describe, expect, it } from 'vitest';
import { daysBetween, normalize, parseHms, parseMwh, parsePercent, parseUtcOffset } from '../../src/lib/report/text';

describe('report text helpers', () => {
  it('normalizes Windows whitespace', () => expect(normalize('  55,997\u00a0mWh\n  ')).toBe('55,997 mWh'));
  it('parses durations with hours beyond one day', () => {
    expect(parseHms('285:27:50')).toBe(1_027_670);
    expect(parseHms('0:00:01')).toBe(1);
    expect(parseHms('-')).toBeNull();
  });
  it('reads integer energy and percentage values across separators', () => {
    expect(parseMwh('55,997 mWh\n   ')).toBe(55_997);
    expect(parseMwh('55.997 mWh')).toBe(55_997);
    expect(parsePercent('73 %')).toBe(73);
    expect(parseMwh('')).toBeNull();
    expect(parseMwh('-')).toBeNull();
  });
  it('parses local UTC offsets and exclusive period lengths', () => {
    expect(parseUtcOffset('+5:30')).toBe(330);
    expect(parseUtcOffset('-04:00')).toBe(-240);
    expect(daysBetween('2025-10-27', '2025-11-03')).toBe(7);
  });
});
