import type { Analysis } from '../analysis';
import type { AiReport } from '../ai/types';
import { formatDuration, formatWh } from '../report/text';
import type { BatteryReport } from '../report/types';

const WIDTH = 1200;
const PAD = 72;
const CONTENT = WIDTH - PAD * 2;
type TextRow = { text: string; lines: string[]; font: string; color: string; lineHeight: number; gapAfter: number };

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > width) { result.push(line); line = word; }
      else line = next;
    }
    result.push(line);
  }
  return result;
}

export function downloadReportImage(report: BatteryReport, analysis: Analysis, ai: AiReport | null): void {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('This browser cannot create an image from the report.');
  const rows: TextRow[] = [];
  const add = (text: string, font: string, color: string, lineHeight: number, gapAfter = 0, inset = 0) => {
    measure.font = font;
    rows.push({ text, lines: wrap(measure, text, CONTENT - inset), font, color, lineHeight, gapAfter });
  };
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    add(title, '600 19px Arial, sans-serif', '#17202b', 27, 8);
    for (const item of items) add(`•  ${item}`, '16px Arial, sans-serif', '#35404d', 25, 7, 8);
    rows.push({ text: '', lines: [], font: '', color: '', lineHeight: 0, gapAfter: 18 });
  };

  add('Gauge · Battery report', '600 32px Arial, sans-serif', '#17202b', 40, 8);
  add(`${report.system.productName ?? 'Device not reported'}  ·  Report generated ${report.system.reportTime?.slice(0, 10) ?? 'not reported'}`, '15px Arial, sans-serif', '#637080', 22, 23);
  add(analysis.healthPercent === null ? 'Battery health not reported' : `${analysis.healthPercent}% battery health`, '600 46px Arial, sans-serif', '#17202b', 54, 5);
  add(analysis.verdict, '16px Arial, sans-serif', '#4f5d6d', 24, 22);
  section('Measured summary', [
    `Full-charge capacity: ${formatWh(analysis.fullChargeMwh)}; design capacity: ${formatWh(analysis.designMwh)}.`,
    `Capacity lost from design: ${analysis.capacityLostMwh === null ? 'not reported' : `${analysis.capacityLostMwh} mWh`}; loss percentage: ${analysis.lossPercent === null ? 'not reported' : `${analysis.lossPercent.toFixed(1)}%`}.`,
    `Latest runtime estimate: ${analysis.latestRuntimeSec === null ? 'not reported' : formatDuration(analysis.latestRuntimeSec)}; average: ${analysis.averageRuntimeSec === null ? 'not reported' : formatDuration(analysis.averageRuntimeSec)}.`,
    `Runtime at design capacity: ${analysis.designRuntimeSec === null ? 'not reported' : formatDuration(analysis.designRuntimeSec)}; at full charge: ${analysis.fullChargeRuntimeSec === null ? 'not reported' : formatDuration(analysis.fullChargeRuntimeSec)}.`,
    `Active use: ${analysis.batteryActiveHours === null ? 'not reported' : `${analysis.batteryActiveHours.toFixed(1)} hours`} on battery and ${analysis.acActiveHours === null ? 'not reported' : `${analysis.acActiveHours.toFixed(1)} hours`} on AC.`,
  ]);
  section('Battery cycle counts', report.batteries.map((battery, index) => `${battery.name ?? `Battery ${index + 1}`}: ${battery.cycleCount === null ? 'not reported' : `${battery.cycleCount} cycles`}`));
  section(ai ? 'AI breakdown' : 'Measured observations', ai ? [ai.summary, ...ai.findings.map((item) => `Finding: ${item}`), ...ai.recommendations.map((item) => `Recommendation: ${item}`), ...ai.limitations.map((item) => `Limitation: ${item}`)] : analysis.observations);
  section('Report coverage', [
    `${analysis.drains.length} active discharge sessions, ${analysis.capacity.length} capacity history periods, ${analysis.usage.length} usage history periods, and ${report.recentUsage.length} recent power entries were parsed.`,
    'Measurements are calculated locally from the uploaded Windows report. AI interpretation is generated separately from report measurements.',
  ]);

  let height = PAD + 26;
  for (const row of rows) height += row.lines.length * row.lineHeight + row.gapAfter;
  height += 74;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.max(720, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create an image from the report.');
  ctx.fillStyle = '#f4f6f8'; ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(36, 36, WIDTH - 72, canvas.height - 72);
  ctx.strokeStyle = '#e2e7ec'; ctx.lineWidth = 1; ctx.strokeRect(36.5, 36.5, WIDTH - 73, canvas.height - 73);
  ctx.fillStyle = '#256a55'; ctx.fillRect(PAD, 62, 5, 42);
  let y = PAD + 4;
  for (const row of rows) {
    ctx.font = row.font; ctx.fillStyle = row.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const line of row.lines) { y += row.lineHeight; ctx.fillText(line, PAD, y, CONTENT); }
    y += row.gapAfter;
  }
  ctx.strokeStyle = '#e6eaee'; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(WIDTH - PAD, y); ctx.stroke();
  y += 27;
  ctx.font = '12px Arial, sans-serif'; ctx.fillStyle = '#75808c';
  ctx.fillText(`Source: ${report.source.fileName}  ·  Gauge  ·  Exported ${new Date().toLocaleDateString()}`, PAD, y, CONTENT);
  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = 'gauge-battery-report.png';
  anchor.click();
}
