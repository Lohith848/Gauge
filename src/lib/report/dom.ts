import { daysBetween, findDates, normalize, parseFirstInt, parseHms, parseUtcOffset } from './text';

export type TableKind = 'system' | 'batteries' | 'recentUsage' | 'drainHistory' | 'usageHistory' | 'capacityHistory' | 'runtimeEstimates' | 'runtimeSinceInstall' | 'unknown';
type CellData = { text: string; classes: string[]; date: string; time: string; divText: string; spanText: string };
type RowData = { cells: CellData[]; gap: boolean };
type TableData = RowData[];
const cell = (node: Element): CellData => ({
  text: normalize(node.textContent), classes: [...Array.from(node.classList), ...(node.querySelector('span.label') ? ['batteries-label'] : [])],
  date: normalize(node.querySelector('span.date')?.textContent), time: normalize(node.querySelector('span.time')?.textContent),
  divText: normalize(node.querySelector('div')?.textContent), spanText: normalize(node.querySelector('span')?.textContent),
});
const rowsOf = (table: HTMLTableElement): TableData => Array.from(table.querySelectorAll('tr'))
  .filter((row) => !row.closest('thead'))
  .map((row) => ({ gap: row.classList.contains('noncontigbreak'), cells: Array.from(row.querySelectorAll(':scope > td, :scope > th')).map(cell) }));
function classify(rows: TableData, seenPeriods: number): TableKind {
  const body = rows.filter((row) => !row.gap);
  const first = body[0]?.cells[0];
  if (first?.classes.includes('label')) return 'system';
  if (first?.classes.includes('batteries-label')) return 'batteries';
  if (rows.some((row) => row.cells.some((c) => c.classes.includes('acdc')))) return 'recentUsage';
  const colbreak = rows.some((row) => row.cells.some((c) => c.classes.includes('colBreak')));
  if (colbreak && first && !first.classes.includes('dateTime')) return 'runtimeSinceInstall';
  const period = colbreak && first?.classes.includes('dateTime');
  if (period) {
    const isRuntime = rows.some((row) => row.cells.some((c) => c.classes.includes('hms') && c.divText));
    return isRuntime || seenPeriods > 0 ? 'runtimeEstimates' : 'usageHistory';
  }
  if (body.length && body.every((row) => row.cells.length === 3 && row.cells[1]?.classes.includes('mw') && row.cells[2]?.classes.includes('mw'))) return 'capacityHistory';
  if (rows.some((row) => row.cells.some((c) => c.classes.includes('hms'))) && !colbreak) return 'drainHistory';
  return 'unknown';
}
const has = (c: CellData | undefined, cls: string) => c?.classes.includes(cls) ?? false;
const datesOf = (text: string) => findDates(text);
const powerState = (raw: string) => {
  const value = raw.toLowerCase();
  if (value === 'active') return 'active' as const;
  if (value === 'connected standby') return 'connected-standby' as const;
  if (value === 'suspended') return 'suspended' as const;
  if (value === 'report generated') return 'report-generated' as const;
  return 'other' as const;
};
const sourceOf = (raw: string) => raw.toLowerCase() === 'battery' ? 'battery' as const : raw.toLowerCase() === 'ac' ? 'ac' as const : 'unknown' as const;
const pair = (secs: (number | null)[]) => ({ activeSec: secs[0] ?? null, standbySec: secs[1] ?? null });
const periodOf = (text: string, warnings: import('./types').ParseWarning[], section: string) => {
  const dates = datesOf(text); if (!dates.length) return null;
  const start = dates[0]!; let end = dates[1] ?? null;
  if (end && end <= start) { warnings.push({ code: 'W_DATE_RANGE', message: 'A reversed date range was treated as one day.', section }); end = null; }
  return { start, end, days: end ? Math.max(1, daysBetween(start, end)) : 1 };
};
const valueOrNull = (c: CellData | undefined) => !c || c.text === '-' ? null : c.text;
const friendlyChemistry: Record<string, string> = {
  lion: 'Lithium-ion', lip: 'Lithium polymer', lipoly: 'Lithium polymer', pbac: 'Lead-acid',
  nicd: 'Nickel-cadmium', nimh: 'Nickel-metal hydride', lifepo4: 'Lithium iron phosphate', znair: 'Zinc-air', ram: 'RAM',
};

import { makeParseError } from './errors';
export function parseHtmlReport(text: string, source: import('./types').SourceMeta): import('./types').Result<import('./types').BatteryReport, import('./types').ParseError> {
  if (!text.trim()) return { ok: false, error: makeParseError('E_EMPTY') };
  if (/^\s*<\?xml|<BatteryReport[\s>]/i.test(text)) return { ok: false, error: makeParseError('E_UNSUPPORTED_FORMAT') };
  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    if (doc.querySelector('.nobatts')) return { ok: false, error: makeParseError('E_NO_BATTERY') };
    if (!doc.documentElement.hasAttribute('xmlns:bat') && !(doc.querySelector('meta[name="ReportUtcOffset"]') && doc.querySelectorAll('h2').length >= 4)) return { ok: false, error: makeParseError('E_NOT_BATTERY_REPORT') };
    const tables = Array.from(doc.body.querySelectorAll('table')).map((table) => ({ node: table, rows: rowsOf(table) }));
    const data: Partial<Record<TableKind, TableData>> = {}; const warnings: import('./types').ParseWarning[] = []; let seenPeriods = 0;
    for (const table of tables) {
      const kind = classify(table.rows, seenPeriods);
      const firstCell = table.rows.find((row) => !row.gap)?.cells[0];
      const isPeriodTable = table.rows.some((row) => row.cells.some((c) => c.classes.includes('colBreak'))) && has(firstCell, 'dateTime');
      if (isPeriodTable) {
        const estimateMarker = table.rows.some((row) => row.cells.some((c) => has(c, 'hms') && c.divText));
        if (estimateMarker !== (seenPeriods > 0)) warnings.push({ code: 'W_TABLE_ORDER_AMBIGUOUS', message: 'A period table was identified from its estimate cells rather than its position.' });
      }
      if (kind === 'usageHistory' || kind === 'runtimeEstimates') seenPeriods += 1;
      if (kind !== 'unknown' && !data[kind]) data[kind] = table.rows;
    }
    const sysRows = (data.system ?? []).filter((row) => !row.gap);
    const sysVals = sysRows.map((row) => row.cells[1]?.text ?? null);
    const reportCell = sysRows[6]?.cells[1];
    const fallbackDate = new Date().toISOString().slice(0, 10);
    const recentRows = (data.recentUsage ?? []).filter((row) => !row.gap);
    const lastRecent = recentRows.at(-1)?.cells.find((item) => has(item, 'dateTime'));
    const carriedDate = [...recentRows].reverse().map((row) => {
      const dateCell = row.cells.find((item) => has(item, 'dateTime'));
      return dateCell?.date || datesOf(dateCell?.text ?? '')[0] || '';
    }).find(Boolean);
    const recentTime = lastRecent?.time || lastRecent?.text.match(/\d{1,2}:\d{2}:\d{2}/)?.[0];
    const reportTime = reportCell?.date && reportCell?.time ? `${reportCell.date}T${reportCell.time}` : carriedDate && recentTime ? `${carriedDate}T${recentTime}` : `${fallbackDate}T00:00:00`;
    if (!reportCell?.date) warnings.push({ code: 'W_REPORT_TIME_FALLBACK', message: 'The report time was not present.' });
    const system = {
      computerName: sysVals[0] ?? null, productName: sysVals[1] ?? null, bios: sysVals[2] ?? null,
      osBuild: sysVals[3] ?? null, platformRole: sysVals[4] ?? null, connectedStandby: sysVals[5] ?? null,
      reportTime, utcOffsetMinutes: parseUtcOffset(doc.querySelector('meta[name="ReportUtcOffset"]')?.getAttribute('content') ?? null),
    };
    const batteryRows = (data.batteries ?? []).filter((row) => !row.gap);
    const batteryCount = Math.max(0, (batteryRows[0]?.cells.length ?? 1) - 1);
    const batteryKeys = ['name', 'manufacturer', 'serialNumber', 'chemistryRaw', 'designCapacityMwh', 'fullChargeCapacityMwh', 'cycleCount'] as const;
    const rawBatteries: Record<string, string | null>[] = Array.from({ length: batteryCount }, () => ({}));
    batteryRows.forEach((row, index) => { for (let i = 0; i < batteryCount; i += 1) rawBatteries[i]![batteryKeys[index]!] = valueOrNull(row.cells[i + 1]); });
    const batteries = rawBatteries.map((raw, index) => {
      const chem = raw.chemistryRaw;
      return {
        index, name: raw.name ?? null, manufacturer: raw.manufacturer ?? null, serialNumber: raw.serialNumber ?? null,
        chemistryRaw: chem ?? null, chemistryFriendly: chem ? friendlyChemistry[chem.toLowerCase()] ?? null : null,
        designCapacityMwh: parseFirstInt(raw.designCapacityMwh ?? ''), fullChargeCapacityMwh: parseFirstInt(raw.fullChargeCapacityMwh ?? ''),
        cycleCount: parseFirstInt(raw.cycleCount ?? ''),
      };
    });
    if (!batteries.length) return { ok: false, error: makeParseError('E_NO_BATTERY') };
    if (batteries.length > 1) warnings.push({ code: 'W_MULTIPLE_BATTERIES', message: `This report lists ${batteries.length} batteries. Gauge is showing the first one.` });
    const recentUsage: import('./types').BatteryReport['recentUsage'] = [];
    let currentDate = '';
    for (const row of (data.recentUsage ?? []).filter((item) => !item.gap)) {
      const dateCell = row.cells.find((c) => has(c, 'dateTime'));
      const date = dateCell?.date || datesOf(dateCell?.text ?? '')[0] || currentDate;
      if (dateCell?.date || datesOf(dateCell?.text ?? '').length) currentDate = date;
      const time = dateCell?.time || dateCell?.text.match(/\d{1,2}:\d{2}:\d{2}/)?.[0];
      const stateCell = row.cells.find((c) => has(c, 'state'));
      if (!date || !time) { warnings.push({ code: 'W_ROW_SKIPPED', message: 'A recent usage row was missing a date or time.' }); continue; }
      const stateLabel = stateCell?.text ?? '';
      recentUsage.push({ start: `${date}T${time}`, state: powerState(stateLabel), stateLabel,
        source: sourceOf(row.cells.find((c) => has(c, 'acdc'))?.text ?? ''),
        remainingPercent: parseFirstInt(row.cells.find((c) => has(c, 'percent'))?.text ?? ''),
        remainingMwh: parseFirstInt(row.cells.find((c) => has(c, 'mw'))?.text ?? '') });
    }
    if (recentUsage.length && recentUsage.filter((r) => r.state === 'other').length / recentUsage.length > 0.2) warnings.push({ code: 'W_LABELS_NOT_RECOGNISED', message: 'Some Windows power-state labels are not recognised in this language.' });
    const drainHistory: import('./types').BatteryReport['drainHistory'] = []; let gap = false; currentDate = '';
    for (const row of data.drainHistory ?? []) {
      if (row.gap) { gap = true; continue; }
      const dateCell = row.cells.find((c) => has(c, 'dateTime')); const dates = datesOf(dateCell?.text ?? '');
      const date = dateCell?.date || dates[0] || currentDate; if (date) currentDate = date;
      const time = dateCell?.time || dateCell?.text.match(/\d{1,2}:\d{2}:\d{2}/)?.[0];
      if (!date || !time) continue;
      const stateLabel = row.cells.find((c) => has(c, 'state'))?.text ?? '';
      const hms = row.cells.find((c) => has(c, 'hms'));
      const percent = row.cells.find((c) => has(c, 'percent'));
      const mw = row.cells.find((c) => has(c, 'mw'));
      drainHistory.push({ start: `${date}T${time}`, state: powerState(stateLabel), stateLabel, durationSec: parseHms(hms?.text ?? '') ?? 0,
        drainedPercent: parseFirstInt(percent?.text ?? ''), drainedMwh: parseFirstInt(mw?.text ?? ''), afterGap: gap }); gap = false;
    }
    const usageHistory: import('./types').BatteryReport['usageHistory'] = (data.usageHistory ?? []).filter((r) => !r.gap).flatMap((row) => {
      const period = periodOf(row.cells[0]?.text ?? '', warnings, 'usageHistory'); if (!period) return [];
      const seconds = row.cells.filter((c) => has(c, 'hms') || has(c, 'nullValue')).map((c) => has(c, 'nullValue') ? null : parseHms(c.text));
      return [{ ...period, battery: pair(seconds.slice(0, 2)), ac: pair(seconds.slice(2, 4)) }];
    });
    const capacityHistory: import('./types').BatteryReport['capacityHistory'] = (data.capacityHistory ?? []).filter((r) => !r.gap).flatMap((row) => {
      const period = periodOf(row.cells[0]?.text ?? '', warnings, 'capacityHistory'); if (!period) return [];
      return [{ ...period, fullChargeMwh: parseFirstInt(row.cells[1]?.text ?? ''), designMwh: parseFirstInt(row.cells[2]?.text ?? '') }];
    });
    const parseEstimate = (c: CellData | undefined) => {
      const duration = parseHms(c?.divText || c?.text || ''); const annotation = /(\d+)\s*%\s*\/\s*(\d+)\s*h/i.exec(c?.spanText ?? '');
      return { durationSec: duration, pctOfTarget: annotation ? Number(annotation[1]) : null, targetHours: annotation ? Number(annotation[2]) : null };
    };
    const runtimeEstimates: import('./types').BatteryReport['runtimeEstimates'] = (data.runtimeEstimates ?? []).filter((r) => !r.gap).flatMap((row) => {
      const period = periodOf(row.cells[0]?.text ?? '', warnings, 'runtimeEstimates'); if (!period) return [];
      const cells = row.cells.filter((c) => has(c, 'hms') || has(c, 'nullValue'));
      return [{ ...period, atFullCharge: { activeSec: parseHms(cells[0]?.text ?? ''), standby: parseEstimate(cells[1]) }, atDesignCapacity: { activeSec: parseHms(cells[2]?.text ?? ''), standby: parseEstimate(cells[3]) } }];
    });
    const sinceRows = (data.runtimeSinceInstall ?? []).filter((r) => !r.gap); const since = sinceRows[0];
    const sinceCells = since?.cells.filter((c) => has(c, 'hms') || has(c, 'nullValue')) ?? [];
    const runtimeSinceInstall = since ? { atFullCharge: { activeSec: parseHms(sinceCells[0]?.text ?? ''), standby: parseEstimate(sinceCells[1]) }, atDesignCapacity: { activeSec: parseHms(sinceCells[2]?.text ?? ''), standby: parseEstimate(sinceCells[3]) } } : null;
    if (!batteries.some((battery) => battery.designCapacityMwh !== null) || !(capacityHistory.length || usageHistory.length || recentUsage.length)) return { ok: false, error: makeParseError('E_NO_DATA') };
    return { ok: true, value: { schemaVersion: 1, source, system, batteries, recentUsage, drainHistory, usageHistory, capacityHistory, runtimeEstimates, runtimeSinceInstall, warnings } };
  } catch { return { ok: false, error: makeParseError('E_NOT_BATTERY_REPORT') }; }
}
