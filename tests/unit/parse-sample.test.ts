import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeReport, parseReport } from '../../src/lib/report';
import { analyze } from '../../src/lib/analysis';
import type { SourceMeta } from '../../src/lib/report/types';

const fixture = readFileSync('tests/fixtures/battery-report.html', 'utf8');
const meta: SourceMeta = { fileName: 'battery-report.html', fileSizeBytes: fixture.length, format: 'windows-html' };

describe('Windows report intake', () => {
  it('parses a report fixture using the documented cell classes', () => {
    const result = parseReport(fixture, meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.system.reportTime).toBe('2026-10-26T18:47:44');
    expect(result.value.system.utcOffsetMinutes).toBe(330);
    expect(result.value.batteries[0]).toMatchObject({ designCapacityMwh: 55_997, fullChargeCapacityMwh: 46_088, cycleCount: null, chemistryFriendly: 'Lithium-ion' });
    expect(result.value.recentUsage[0]).toMatchObject({ start: '2026-10-21T18:58:39', remainingPercent: 73, remainingMwh: 33_714, source: 'battery' });
    expect(result.value.recentUsage.at(-1)?.start).toBe('2026-10-26T18:47:43');
    expect(result.value.drainHistory[2]?.afterGap).toBe(true);
    expect(result.value.usageHistory[0]).toMatchObject({ start: '2025-10-27', end: '2025-11-03', days: 7, battery: { activeSec: 71_646, standbySec: 11_857 } });
    expect(result.value.capacityHistory.at(-1)).toMatchObject({ start: '2026-10-25', fullChargeMwh: 46_088, designMwh: 55_997 });
    expect(result.value.runtimeEstimates[0]?.atFullCharge.standby).toMatchObject({ durationSec: 62_391, pctOfTarget: 92, targetHours: 16 });
  });

  it('maps battery fields by their labels and calculates health from capacity history when the summary field is absent', () => {
    const missingSerial = fixture.replace('<tr><td><span class="label">SERIAL NUMBER</span></td><td>0000</td></tr>', '');
    const missingSummaryCapacity = missingSerial.replace('<tr><td><span class="label">FULL CHARGE CAPACITY</span></td><td>46,088 mWh</td></tr>', '');
    const result = parseReport(missingSummaryCapacity, meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.batteries[0]).toMatchObject({ designCapacityMwh: 55_997, fullChargeCapacityMwh: null, cycleCount: null });
    const calculated = analyze(result.value);
    expect(calculated.fullChargeMwh).toBe(46_088);
    expect(calculated.healthPercent).toBe(82);
  });

  it('extracts the cycle count from its labelled battery row', () => {
    const withMisreadCycle = fixture.replace('<tr><td><span class="label">CYCLE COUNT</span></td><td class="nullValue">-</td>', '<tr><td><span class="label">CYCLE COUNT</span></td><td>46,168</td>');
    const result = parseReport(withMisreadCycle, meta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.batteries[0]?.cycleCount).toBe(46_168);
  });

  it('returns the documented empty, XML, and non-report errors', () => {
    expect(parseReport(' ', meta)).toMatchObject({ ok: false, error: { code: 'E_EMPTY' } });
    expect(parseReport('<?xml version="1.0"?><BatteryReport/>', { ...meta, format: 'windows-xml' })).toMatchObject({ ok: false, error: { code: 'E_UNSUPPORTED_FORMAT' } });
    expect(parseReport('<html><body><h1>Other page</h1></body></html>', meta)).toMatchObject({ ok: false, error: { code: 'E_NOT_BATTERY_REPORT' } });
    expect(parseReport('<html><body><div class="nobatts">No batteries</div></body></html>', meta)).toMatchObject({ ok: false, error: { code: 'E_NO_BATTERY' } });
  });

  it('decodes UTF-16 little-endian and safely rejects truncated documents', () => {
    const utf16 = new Uint8Array(2 + fixture.length * 2); utf16[0] = 0xff; utf16[1] = 0xfe;
    for (let i = 0; i < fixture.length; i += 1) { utf16[2 + i * 2] = fixture.charCodeAt(i) & 0xff; utf16[3 + i * 2] = fixture.charCodeAt(i) >> 8; }
    expect(decodeReport(utf16.buffer)).toBe(fixture);
    for (let i = 0; i < 50; i += 1) {
      const end = Math.floor((fixture.length * i) / 50);
      expect(() => parseReport(fixture.slice(0, end), meta)).not.toThrow();
    }
  });
});
