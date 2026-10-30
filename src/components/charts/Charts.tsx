import { scaleLinear, scaleTime } from 'd3-scale';
import { line, curveLinear } from 'd3-shape';
import type { CapacityPoint, UsagePeriod } from '../../lib/report/types';

export function CapacityChart({ points }: { points: CapacityPoint[] }) {
  const width = 820; const height = 250; const margin = { top: 20, right: 56, bottom: 42, left: 12 };
  const valid = points.filter((point) => point.fullChargeMwh !== null && point.designMwh !== null);
  if (!valid.length) return <div className="chart-empty-state">No capacity history was included in this report.</div>;
  const dates = valid.map((point) => new Date(`${point.start}T00:00:00Z`));
  const extent = [dates[0]!, dates[dates.length - 1]!] as [Date, Date];
  const values = valid.flatMap((point) => [point.fullChargeMwh!, point.designMwh!]);
  const dataMin = Math.min(...values); const dataMax = Math.max(...values);
  const padding = Math.max(1000, (dataMax - dataMin) * 0.12);
  const max = dataMax + padding;
  const min = Math.max(0, dataMin - padding);
  const x = scaleTime().domain(extent).range([margin.left, width - margin.right]);
  const y = scaleLinear().domain([min, max]).nice(4).range([height - margin.bottom, margin.top]);
  const actualLine = line<CapacityPoint>().defined((point) => point.fullChargeMwh !== null).x((point) => x(new Date(`${point.start}T00:00:00Z`))).y((point) => y(point.fullChargeMwh ?? 0)).curve(curveLinear)(valid) ?? '';
  const designLine = line<CapacityPoint>().defined((point) => point.designMwh !== null).x((point) => x(new Date(`${point.start}T00:00:00Z`))).y((point) => y(point.designMwh ?? 0)).curve(curveLinear)(valid) ?? '';
  const yTicks = y.ticks(4); const xTicks = x.ticks(5);
  return <div className="chart-frame"><div className="chart-legend"><span><i className="legend-line blue" />Full-charge capacity</span><span><i className="legend-line design" />Design capacity</span></div>
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="capacity-chart-title capacity-chart-desc" preserveAspectRatio="none">
      <title id="capacity-chart-title">Battery capacity over time</title><desc id="capacity-chart-desc">Full-charge capacity and design capacity in milliwatt-hours.</desc>
      {yTicks.map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="chart-gridline" /><text x={width - margin.right + 10} y={y(tick) + 4} className="chart-axis">{Math.round(tick / 1000)}k</text></g>)}
      <path d={designLine} className="chart-design-line" /><path d={actualLine} className="chart-actual-line" />
      {valid.length > 0 && <circle cx={x(new Date(`${valid.at(-1)!.start}T00:00:00Z`))} cy={y(valid.at(-1)!.fullChargeMwh ?? 0)} r="4" className="chart-point" />}
      {xTicks.map((tick) => <text key={tick.toISOString()} x={x(tick)} y={height - 12} textAnchor="middle" className="chart-axis">{tick.toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</text>)}
    </svg></div>;
}

export function UsageChart({ periods }: { periods: UsagePeriod[] }) {
  const data = [...periods].sort((a, b) => a.start.localeCompare(b.start)).slice(-12);
  if (!data.length) return <div className="chart-empty-state">No usage history was included in this report.</div>;
  const width = 820; const height = 190; const margin = { top: 12, right: 16, bottom: 38, left: 12 };
  const max = Math.max(1, ...data.flatMap((period) => [(period.battery.activeSec ?? 0) / 3600, (period.ac.activeSec ?? 0) / 3600]));
  const y = scaleLinear().domain([0, max]).nice(3).range([height - margin.bottom, margin.top]);
  const slot = (width - margin.left - margin.right) / Math.max(data.length, 1); const barWidth = Math.min(26, slot * 0.52);
  const yTicks = y.ticks(3);
  return <div className="chart-frame usage-chart-frame"><svg className="chart-svg usage-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="usage-chart-title usage-chart-desc" preserveAspectRatio="none">
    <title id="usage-chart-title">Active hours on battery and AC power</title><desc id="usage-chart-desc">Monthly active usage hours shown as paired bars.</desc>
    {yTicks.map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="chart-gridline" /><text x={margin.left} y={y(tick) - 5} className="chart-axis">{tick}h</text></g>)}
    {data.map((period, index) => {
      const center = margin.left + slot * index + slot / 2; const battery = (period.battery.activeSec ?? 0) / 3600; const ac = (period.ac.activeSec ?? 0) / 3600;
      return <g key={period.start}><rect x={center - barWidth - 2} y={y(battery)} width={barWidth} height={Math.max(0, y(0) - y(battery))} className="usage-bar-battery" /><rect x={center + 2} y={y(ac)} width={barWidth} height={Math.max(0, y(0) - y(ac))} className="usage-bar-ac" /><text x={center} y={height - 12} textAnchor="middle" className="chart-axis">{new Date(`${period.start}T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })}</text></g>;
    })}
    {!data.length && <text x={width / 2} y={height / 2} textAnchor="middle" className="chart-empty">No usage history in this report</text>}
  </svg></div>;
}
