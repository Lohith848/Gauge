import { useMemo, useState } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { line, curveLinear } from 'd3-shape';
import type { CapacityPoint, UsagePeriod } from '../../lib/report/types';

type Range = 'all' | '12' | '6';
function RangeControl({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  return <div className="chart-range" role="group" aria-label="Filter chart history">
    {(['6', '12', 'all'] as const).map((range) => <button key={range} type="button" aria-pressed={value === range} onClick={() => onChange(range)}>{range === 'all' ? 'All' : `Last ${range}`}</button>)}
  </div>;
}
function takeRange<T,>(data: T[], range: Range): T[] { return range === 'all' ? data : data.slice(-Number(range)); }
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function CapacityChart({ points }: { points: CapacityPoint[] }) {
  const [range, setRange] = useState<Range>('all');
  const [selected, setSelected] = useState<CapacityPoint | null>(null);
  const valid = useMemo(() => takeRange([...points].filter((point) => point.fullChargeMwh !== null && point.designMwh !== null).sort((a, b) => a.start.localeCompare(b.start)), range), [points, range]);
  const width = 820; const height = 250; const margin = { top: 20, right: 56, bottom: 42, left: 12 };
  if (!valid.length) return <div className="chart-empty-state">No capacity history was included in this report.</div>;
  const dates = valid.map((point) => new Date(`${point.start}T00:00:00Z`));
  const extent = dates.length === 1 ? [new Date(dates[0]!.getTime() - 86400000), new Date(dates[0]!.getTime() + 86400000)] as [Date, Date] : [dates[0]!, dates[dates.length - 1]!] as [Date, Date];
  const values = valid.flatMap((point) => [point.fullChargeMwh!, point.designMwh!]);
  const dataMin = Math.min(...values); const dataMax = Math.max(...values); const padding = Math.max(1000, (dataMax - dataMin) * 0.12);
  const y = scaleLinear().domain([Math.max(0, dataMin - padding), dataMax + padding]).nice(4).range([height - margin.bottom, margin.top]);
  const x = scaleTime().domain(extent).range([margin.left, width - margin.right]);
  const actualLine = line<CapacityPoint>().x((point) => x(new Date(`${point.start}T00:00:00Z`))).y((point) => y(point.fullChargeMwh ?? 0)).curve(curveLinear)(valid) ?? '';
  const designLine = line<CapacityPoint>().x((point) => x(new Date(`${point.start}T00:00:00Z`))).y((point) => y(point.designMwh ?? 0)).curve(curveLinear)(valid) ?? '';
  return <div className="chart-frame"><div className="chart-tools"><div className="chart-legend"><span><i className="legend-line blue" />Full-charge capacity</span><span><i className="legend-line design" />Design capacity</span></div><RangeControl value={range} onChange={(next) => { setRange(next); setSelected(null); }} /></div>
    <div className="chart-inspector" role="status" aria-live="polite">{selected ? <><strong>{dateLabel(selected.start)}</strong><span>Full charge <b>{(selected.fullChargeMwh! / 1000).toFixed(2)} Wh</b></span><span>Design <b>{(selected.designMwh! / 1000).toFixed(2)} Wh</b></span></> : <span className="chart-inspector-hint">Focus or hover a reading to inspect its measured values.</span>}</div>
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Interactive battery capacity history chart" onMouseLeave={() => setSelected(null)}>
      <title>Battery capacity over time</title><desc>Use the history range controls and focus a point to inspect recorded full-charge and design capacity.</desc>
      {y.ticks(4).map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="chart-gridline" /><text x={width - margin.right + 10} y={y(tick) + 4} className="chart-axis">{Math.round(tick / 1000)}k</text></g>)}
      <path d={designLine} className="chart-design-line" /><path d={actualLine} className="chart-actual-line" />
      {valid.map((point) => <g key={point.start} className="chart-hit" tabIndex={0} role="button" aria-label={`${dateLabel(point.start)}. Full charge ${(point.fullChargeMwh! / 1000).toFixed(2)} watt hours. Design ${(point.designMwh! / 1000).toFixed(2)} watt hours.`} onFocus={() => setSelected(point)} onMouseEnter={() => setSelected(point)} onClick={() => setSelected(selected?.start === point.start ? null : point)}><circle cx={x(new Date(`${point.start}T00:00:00Z`))} cy={y(point.fullChargeMwh!)} r="11" className="chart-hit-area" /><circle cx={x(new Date(`${point.start}T00:00:00Z`))} cy={y(point.fullChargeMwh!)} r={selected?.start === point.start ? 5 : 3} className="chart-point" /></g>)}
      {x.ticks(Math.min(5, valid.length)).map((tick) => <text key={tick.toISOString()} x={x(tick)} y={height - 12} textAnchor="middle" className="chart-axis">{tick.toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text>)}
    </svg></div>;
}

export function UsageChart({ periods }: { periods: UsagePeriod[] }) {
  const [range, setRange] = useState<Range>('12');
  const [selected, setSelected] = useState<UsagePeriod | null>(null);
  const data = useMemo(() => takeRange([...periods].sort((a, b) => a.start.localeCompare(b.start)), range), [periods, range]);
  if (!data.length) return <div className="chart-empty-state">No usage history was included in this report.</div>;
  const width = 820; const height = 190; const margin = { top: 12, right: 16, bottom: 38, left: 12 };
  const max = Math.max(1, ...data.flatMap((period) => [(period.battery.activeSec ?? 0) / 3600, (period.ac.activeSec ?? 0) / 3600]));
  const y = scaleLinear().domain([0, max]).nice(3).range([height - margin.bottom, margin.top]);
  const slot = (width - margin.left - margin.right) / Math.max(data.length, 1); const barWidth = Math.min(26, slot * 0.52);
  return <div className="chart-frame usage-chart-frame"><div className="chart-tools"><div className="chart-legend"><span><i className="legend-line blue" />Battery active</span><span><i className="legend-line design" />AC active</span></div><RangeControl value={range} onChange={(next) => { setRange(next); setSelected(null); }} /></div>
    <div className="chart-inspector" role="status" aria-live="polite">{selected ? <><strong>{dateLabel(selected.start)}</strong><span>Battery <b>{((selected.battery.activeSec ?? 0) / 3600).toFixed(1)} h</b></span><span>AC <b>{((selected.ac.activeSec ?? 0) / 3600).toFixed(1)} h</b></span></> : <span className="chart-inspector-hint">Focus or hover a period to inspect its measured active time.</span>}</div>
    <svg className="chart-svg usage-chart-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Interactive active hours chart" onMouseLeave={() => setSelected(null)}>
      <title>Active hours on battery and AC power</title><desc>Monthly active use in hours. Focus or select a pair of bars to inspect the exact values.</desc>
      {y.ticks(3).map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="chart-gridline" /><text x={margin.left} y={y(tick) - 5} className="chart-axis">{tick}h</text></g>)}
      {data.map((period, index) => {
        const center = margin.left + slot * index + slot / 2; const battery = (period.battery.activeSec ?? 0) / 3600; const ac = (period.ac.activeSec ?? 0) / 3600;
        return <g key={period.start} className="chart-hit" tabIndex={0} role="button" aria-label={`${dateLabel(period.start)}. Battery active ${battery.toFixed(1)} hours. AC active ${ac.toFixed(1)} hours.`} onFocus={() => setSelected(period)} onMouseEnter={() => setSelected(period)} onClick={() => setSelected(selected?.start === period.start ? null : period)}><rect x={center - barWidth - 2} y={y(battery)} width={barWidth} height={Math.max(0, y(0) - y(battery))} className="usage-bar-battery" /><rect x={center + 2} y={y(ac)} width={barWidth} height={Math.max(0, y(0) - y(ac))} className="usage-bar-ac" /><rect x={center - slot / 2} y={margin.top} width={slot} height={height - margin.bottom - margin.top} className="usage-hit-area" /><text x={center} y={height - 12} textAnchor="middle" className="chart-axis">{new Date(`${period.start}T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })}</text></g>;
      })}
    </svg></div>;
}
