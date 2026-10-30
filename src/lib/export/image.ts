import type { Analysis } from '../analysis';
import type { AiReport } from '../ai/types';
import { formatDuration, formatWh } from '../report/text';
import type { BatteryReport, CapacityPoint } from '../report/types';

const WIDTH = 1600;
const PAGE_X = 32;
const PAGE_Y = 32;
const PAGE_WIDTH = WIDTH - PAGE_X * 2;
const PAD = 64;
const LEFT = PAGE_X + PAD;
const RIGHT = WIDTH - PAGE_X - PAD;
const CONTENT = RIGHT - LEFT;
const FONT = 'Arial, Helvetica, sans-serif';
const COLORS = {
  page: '#edf1f3', white: '#ffffff', ink: '#17212b', muted: '#64717d', faint: '#8a959e',
  line: '#e1e7e9', green: '#26715a', greenPale: '#e7f1ec', hero: '#172b28', heroMuted: '#c3d3cd',
  blue: '#427fbd', bluePale: '#e9f0f7', amber: '#b27636', amberPale: '#f5eee4', track: '#e8edef',
};

type Point = { x: number; y: number };

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 400): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  let result = text;
  while (result.length > 1 && ctx.measureText(result).width > maxWidth) result = `${result.slice(0, -2)}…`;
  ctx.fillText(result, x, y, maxWidth);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, fontSize: number, color: string, lineHeight: number, weight = 400): number {
  setFont(ctx, fontSize, weight);
  ctx.fillStyle = color;
  for (const line of wrap(ctx, text, maxWidth)) {
    y += lineHeight;
    ctx.fillText(line, x, y, maxWidth);
  }
  return y;
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  roundedRect(ctx, x, y, width, height, 16, COLORS.white, COLORS.line);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = COLORS.muted): void {
  setFont(ctx, 13, 700);
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
}

function valueText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Not reported' : value.toLocaleString('en-US');
}

function drawCapacityChart(ctx: CanvasRenderingContext2D, points: CapacityPoint[], x: number, y: number, width: number, height: number): void {
  const series = points.filter((point) => point.fullChargeMwh !== null && Number.isFinite(point.fullChargeMwh));
  if (!series.length) {
    drawWrapped(ctx, 'No battery capacity history rows were included in this report.', x + 28, y + 68, width - 56, 15, COLORS.muted, 23);
    return;
  }

  const plot = { x: x + 76, y: y + 86, width: width - 110, height: height - 150 };
  const realValues = series.flatMap((point) => [point.fullChargeMwh, point.designMwh]).filter((value): value is number => value !== null && Number.isFinite(value));
  const lowValue = Math.min(...realValues);
  const highValue = Math.max(...realValues);
  const spread = Math.max(highValue - lowValue, Math.abs(highValue) * 0.04, 100);
  const min = Math.max(0, lowValue - spread * 0.15);
  const max = highValue + spread * 0.15;
  const yFor = (value: number) => plot.y + plot.height - ((value - min) / (max - min)) * plot.height;
  const xFor = (index: number) => plot.x + (series.length === 1 ? plot.width / 2 : index / (series.length - 1) * plot.width);

  ctx.textAlign = 'right';
  setFont(ctx, 11);
  for (let tick = 0; tick <= 3; tick += 1) {
    const val = max - (max - min) * tick / 3;
    const ty = plot.y + plot.height * tick / 3;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, ty);
    ctx.lineTo(plot.x + plot.width, ty);
    ctx.stroke();
    ctx.fillStyle = COLORS.faint;
    ctx.fillText(Math.round(val).toLocaleString('en-US'), plot.x - 12, ty + 4);
  }
  ctx.textAlign = 'left';

  const designSeries = series.map((point, index) => ({ x: xFor(index), y: point.designMwh === null ? null : yFor(point.designMwh) })).filter((point): point is Point => point.y !== null);
  if (designSeries.length >= 2) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    designSeries.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
  }

  const capacitySeries = series.map((point, index) => ({ x: xFor(index), y: yFor(point.fullChargeMwh!) }));
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  capacitySeries.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  if (capacitySeries.length > 1) ctx.stroke();
  for (const point of capacitySeries) {
    ctx.beginPath();
    ctx.fillStyle = COLORS.white;
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const dateIndices = Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]));
  ctx.fillStyle = COLORS.faint;
  setFont(ctx, 11);
  ctx.textAlign = 'center';
  for (const index of dateIndices) {
    const date = series[index]!.start;
    ctx.fillText(date.length >= 7 ? date.slice(0, 7) : date, xFor(index), plot.y + plot.height + 24);
  }
  ctx.textAlign = 'left';

  const legendY = y + height - 22;
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 28, legendY);
  ctx.lineTo(x + 50, legendY);
  ctx.stroke();
  setFont(ctx, 12);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Full-charge capacity', x + 58, legendY + 4);
  const hasDesign = series.some((point) => point.designMwh !== null);
  if (hasDesign) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x + 224, legendY);
    ctx.lineTo(x + 246, legendY);
    ctx.stroke();
    ctx.restore();
    ctx.fillText('Design capacity', x + 254, legendY + 4);
  }
}

function drawUsageChart(ctx: CanvasRenderingContext2D, analysis: Analysis, x: number, y: number, width: number): void {
  const rows = [
    { name: 'Battery active', value: analysis.batteryActiveHours, color: COLORS.blue, pale: COLORS.bluePale },
    { name: 'Battery standby', value: analysis.batteryStandbyHours, color: COLORS.blue, pale: COLORS.bluePale },
    { name: 'AC active', value: analysis.acActiveHours, color: COLORS.green, pale: COLORS.greenPale },
    { name: 'AC standby', value: analysis.acStandbyHours, color: COLORS.green, pale: COLORS.greenPale },
  ];
  const valid = rows.map((row) => row.value).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) {
    drawWrapped(ctx, 'No usage history values were included in this report.', x + 26, y + 92, width - 52, 15, COLORS.muted, 23);
    return;
  }
  const max = Math.max(...valid, 0);
  let rowY = y + 92;
  for (const row of rows) {
    label(ctx, row.name, x + 26, rowY, COLORS.muted);
    setFont(ctx, 15, 700);
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'right';
    ctx.fillText(row.value === null ? 'Not reported' : `${row.value.toFixed(1)} h`, x + width - 26, rowY);
    ctx.textAlign = 'left';
    const barY = rowY + 14;
    roundedRect(ctx, x + 26, barY, width - 52, 8, 4, COLORS.track);
    if (row.value !== null && max > 0 && row.value > 0) {
      const barWidth = (width - 52) * row.value / max;
      roundedRect(ctx, x + 26, barY, barWidth, 8, 4, row.color);
    }
    rowY += 62;
  }
}

function getReportTime(report: BatteryReport): string {
  return report.system.reportTime?.replace('T', ' ').slice(0, 16) ?? 'Not reported';
}

export function downloadReportImage(report: BatteryReport, analysis: Analysis, ai: AiReport | null): void {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('This browser cannot create an image from the report.');

  const leftCardX = LEFT;
  const chartY = 592;
  const chartHeight = 372;
  const chartGap = 20;
  const capacityWidth = Math.round(CONTENT * 0.61);
  const usageX = leftCardX + capacityWidth + chartGap;
  const usageWidth = RIGHT - usageX;
  const latestY = chartY + chartHeight + 20;
  const latestHeight = 178;
  const bottomY = latestY + latestHeight + 20;
  const textColumnWidth = Math.round(CONTENT * 0.61);
  const detailsX = LEFT + textColumnWidth + chartGap;
  const detailsWidth = RIGHT - detailsX;
  const aiItems = ai ? [
    ...ai.findings.map((item) => `Finding · ${item}`),
    ...ai.recommendations.map((item) => `Recommendation · ${item}`),
    ...ai.limitations.map((item) => `Report limitation · ${item}`),
  ] : analysis.observations;

  setFont(measure, 15);
  const summaryLines = wrap(measure, ai?.summary ?? 'These observations are calculated from the measurements and history contained in the uploaded report.', textColumnWidth - 56);
  let leftBottom = bottomY + 76 + summaryLines.length * 24 + 16;
  for (const item of aiItems) {
    const lines = wrap(measure, item, textColumnWidth - 86);
    leftBottom += Math.max(1, lines.length) * 22 + 12;
  }
  const detailsHeight = 410;
  const footerY = Math.max(leftBottom, bottomY + detailsHeight) + 28;
  const height = footerY + 74;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create an image from the report.');

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  roundedRect(ctx, PAGE_X, PAGE_Y, PAGE_WIDTH, canvas.height - PAGE_Y * 2, 18, COLORS.white, COLORS.line);

  // Brand and report identity.
  roundedRect(ctx, LEFT, 68, 38, 30, 8, COLORS.greenPale);
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(LEFT + 8, 76, 21, 14, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(LEFT + 30, 80);
  ctx.lineTo(LEFT + 34, 80);
  ctx.lineTo(LEFT + 34, 86);
  ctx.lineTo(LEFT + 30, 86);
  ctx.stroke();
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(LEFT + 11, 79, 9, 8);
  setFont(ctx, 22, 700);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('Gauge', LEFT + 50, 91);
  setFont(ctx, 12, 700);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('BATTERY HEALTH REPORT', RIGHT, 82);
  ctx.fillStyle = COLORS.faint;
  ctx.fillText(`EXPORTED ${new Date().toLocaleDateString()}`, RIGHT, 103);
  ctx.textAlign = 'left';
  setFont(ctx, 19, 700);
  ctx.fillStyle = COLORS.ink;
  fitText(ctx, report.system.productName ?? report.system.computerName ?? 'Device not reported in report', LEFT, 145, CONTENT);
  setFont(ctx, 13);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Report generated ${getReportTime(report)}  ·  ${report.batteries.length} battery${report.batteries.length === 1 ? '' : 'ies'} in report`, LEFT, 171);
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(LEFT, 192);
  ctx.lineTo(RIGHT, 192);
  ctx.stroke();

  // Health overview.
  const heroY = 216;
  const heroHeight = 220;
  roundedRect(ctx, LEFT, heroY, CONTENT, heroHeight, 18, COLORS.hero);
  label(ctx, 'Battery health', LEFT + 36, heroY + 42, COLORS.heroMuted);
  setFont(ctx, analysis.healthPercent === null ? 48 : 68, 700);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(analysis.healthPercent === null ? 'Not measured' : `${analysis.healthPercent}%`, LEFT + 36, heroY + 122);
  setFont(ctx, 16, 700);
  ctx.fillStyle = '#d5e4dd';
  ctx.fillText(analysis.verdict, LEFT + 38, heroY + 157);
  setFont(ctx, 13);
  ctx.fillStyle = COLORS.heroMuted;
  ctx.fillText('Full-charge capacity compared with the battery’s design capacity', LEFT + 36, heroY + 190);
  if (analysis.healthPercent !== null) {
    const ringX = RIGHT - 150;
    const ringY = heroY + 110;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#354a44';
    ctx.beginPath();
    ctx.arc(ringX, ringY, 58, 0, Math.PI * 2);
    ctx.stroke();
    const healthArc = Math.max(0, Math.min(100, analysis.healthPercent)) / 100;
    ctx.strokeStyle = '#7fc6a5';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ringX, ringY, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthArc);
    ctx.stroke();
    ctx.lineCap = 'butt';
    setFont(ctx, 12, 700);
    ctx.fillStyle = COLORS.heroMuted;
    ctx.textAlign = 'center';
    ctx.fillText('MEASURED', ringX, ringY + 4);
    ctx.textAlign = 'left';
  } else {
    setFont(ctx, 12, 700);
    ctx.fillStyle = COLORS.heroMuted;
    ctx.textAlign = 'right';
    ctx.fillText('CAPACITY DATA NOT REPORTED', RIGHT - 36, heroY + 114);
    ctx.textAlign = 'left';
  }

  // Measured capacity metrics.
  const metricY = 456;
  const metricGap = 16;
  const metricWidth = (CONTENT - metricGap * 3) / 4;
  const metrics = [
    { title: 'Full-charge capacity', value: formatWh(analysis.fullChargeMwh), note: 'Latest reported full charge' },
    { title: 'Design capacity', value: formatWh(analysis.designMwh), note: 'Original reported capacity' },
    { title: 'Capacity lost', value: analysis.capacityLostMwh === null ? 'Not reported' : formatWh(analysis.capacityLostMwh), note: analysis.lossPercent === null ? 'Loss percentage not reported' : `${analysis.lossPercent.toFixed(1)}% of design capacity` },
    { title: 'Cycle count', value: valueText(analysis.cycleCount), note: 'As reported by the battery' },
  ];
  metrics.forEach((metric, index) => {
    const x = LEFT + index * (metricWidth + metricGap);
    drawCard(ctx, x, metricY, metricWidth, 112);
    label(ctx, metric.title, x + 20, metricY + 30);
    setFont(ctx, metric.value.length > 15 ? 22 : 28, 700);
    ctx.fillStyle = COLORS.ink;
    fitText(ctx, metric.value, x + 20, metricY + 68, metricWidth - 40);
    setFont(ctx, 12);
    ctx.fillStyle = COLORS.muted;
    fitText(ctx, metric.note, x + 20, metricY + 94, metricWidth - 40);
  });

  // Capacity history and usage chart cards.
  drawCard(ctx, LEFT, chartY, capacityWidth, chartHeight);
  label(ctx, 'Capacity history', LEFT + 28, chartY + 34, COLORS.ink);
  setFont(ctx, 12);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Reported full-charge and design capacity · mWh', LEFT + 28, chartY + 57);
  drawCapacityChart(ctx, analysis.capacity, LEFT, chartY, capacityWidth, chartHeight);

  drawCard(ctx, usageX, chartY, usageWidth, chartHeight);
  label(ctx, 'Power usage', usageX + 26, chartY + 34, COLORS.ink);
  setFont(ctx, 12);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Total duration in usage history · hours', usageX + 26, chartY + 57);
  drawUsageChart(ctx, analysis, usageX, chartY, usageWidth);

  // Most recent real power reading.
  drawCard(ctx, LEFT, latestY, CONTENT, latestHeight);
  label(ctx, 'Latest reading in report', LEFT + 28, latestY + 34, COLORS.ink);
  if (analysis.latestReading) {
    const reading = analysis.latestReading;
    const cells = [
      { title: 'Battery charge', value: reading.remainingPercent === null ? 'Not reported' : `${reading.remainingPercent}%` },
      { title: 'Remaining energy', value: formatWh(reading.remainingMwh) },
      { title: 'Power source', value: reading.source === 'unknown' ? 'Not reported' : reading.source === 'ac' ? 'AC' : 'Battery' },
      { title: 'Power state', value: reading.stateLabel || 'Not reported' },
    ];
    const cellGap = 18;
    const cellWidth = (CONTENT - 56 - cellGap * 3) / 4;
    cells.forEach((cell, index) => {
      const x = LEFT + 28 + index * (cellWidth + cellGap);
      label(ctx, cell.title, x, latestY + 74);
      setFont(ctx, 20, 700);
      ctx.fillStyle = COLORS.ink;
      fitText(ctx, cell.value, x, latestY + 107, cellWidth);
    });
    setFont(ctx, 12);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Recorded ${reading.start.replace('T', ' ')} · a report entry, not a live sensor reading`, LEFT + 28, latestY + 151);
  } else {
    drawWrapped(ctx, 'This report does not include a recent power reading.', LEFT + 28, latestY + 70, CONTENT - 56, 15, COLORS.muted, 23);
  }

  // Interpretation and source details.
  const leftBottomX = LEFT;
  const detailsHeightValue = detailsHeight;
  drawCard(ctx, leftBottomX, bottomY, textColumnWidth, Math.max(160, leftBottom - bottomY + 20));
  label(ctx, ai ? 'AI interpretation' : 'Measured observations', leftBottomX + 28, bottomY + 36, COLORS.ink);
  let textY = drawWrapped(ctx,
    ai?.summary ?? 'These observations are calculated from the measurements and history contained in the uploaded report.',
    leftBottomX + 28, bottomY + 50, textColumnWidth - 56, 15, COLORS.ink, 24, 400);
  textY += 16;
  for (const item of aiItems) {
    ctx.fillStyle = ai ? COLORS.green : COLORS.blue;
    ctx.beginPath();
    ctx.arc(leftBottomX + 34, textY + 8, 3, 0, Math.PI * 2);
    ctx.fill();
    textY = drawWrapped(ctx, item, leftBottomX + 48, textY, textColumnWidth - 78, 13, COLORS.muted, 21);
    textY += 10;
  }

  drawCard(ctx, detailsX, bottomY, detailsWidth, detailsHeightValue);
  label(ctx, 'Report details', detailsX + 24, bottomY + 36, COLORS.ink);
  const detailRows: [string, string][] = [
    ['Battery', report.batteries[0]?.name ?? 'Not reported'],
    ['Manufacturer', report.batteries[0]?.manufacturer ?? 'Not reported'],
    ['Capacity trend', analysis.trend],
    ['Latest runtime', formatDuration(analysis.latestRuntimeSec)],
    ['Average runtime', formatDuration(analysis.averageRuntimeSec)],
    ['Runtime at design capacity', formatDuration(analysis.designRuntimeSec)],
    ['Runtime at full charge', formatDuration(analysis.fullChargeRuntimeSec)],
  ];
  let detailY = bottomY + 70;
  for (const [key, value] of detailRows) {
    setFont(ctx, 12);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(key, detailsX + 24, detailY);
    setFont(ctx, 12, 700);
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'right';
    fitText(ctx, value, detailsX + detailsWidth * 0.48, detailY, detailsWidth - 72);
    ctx.textAlign = 'left';
    detailY += 31;
  }
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(detailsX + 24, detailY - 5);
  ctx.lineTo(detailsX + detailsWidth - 24, detailY - 5);
  ctx.stroke();
  setFont(ctx, 11);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${analysis.capacity.length} capacity periods  ·  ${analysis.usage.length} usage periods  ·  ${report.recentUsage.length} recent readings`, detailsX + 24, detailY + 18);
  if (ai) {
    setFont(ctx, 10);
    ctx.fillStyle = COLORS.faint;
    ctx.fillText(`AI interpretation by ${ai.model}`, detailsX + 24, detailY + 36);
  }

  // Footer and report source.
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(LEFT, footerY);
  ctx.lineTo(RIGHT, footerY);
  ctx.stroke();
  setFont(ctx, 11);
  ctx.fillStyle = COLORS.muted;
  fitText(ctx, `Source report · ${report.source.fileName}`, LEFT, footerY + 28, CONTENT * 0.68);
  ctx.textAlign = 'right';
  ctx.fillText('Gauge  ·  Values calculated from the uploaded report', RIGHT, footerY + 28);
  ctx.textAlign = 'left';

  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = 'gauge-battery-report.png';
  anchor.click();
}
