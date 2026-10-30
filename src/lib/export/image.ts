import type { Analysis } from '../analysis';
import type { AiReport } from '../ai/types';
import { formatWh } from '../report/text';
import type { BatteryReport } from '../report/types';

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function downloadReportImage(report: BatteryReport, analysis: Analysis, ai: AiReport | null): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  const sections = [
    ...(ai ? [ai.summary, ...ai.findings, ...ai.recommendations, ...ai.limitations] : analysis.observations),
  ];
  canvas.height = 1100 + Math.min(16, sections.length) * 120;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create an image from the report.');

  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(52, 48, canvas.width - 104, canvas.height - 96);
  ctx.strokeStyle = '#e2e5e9';
  ctx.strokeRect(52, 48, canvas.width - 104, canvas.height - 96);
  ctx.fillStyle = '#1d5fbf';
  ctx.fillRect(88, 88, 8, 42);

  let y = 112;
  ctx.fillStyle = '#101215';
  ctx.font = '600 34px Geist, Arial, sans-serif';
  ctx.fillText('Gauge · Battery report', 116, y);
  y += 34;
  ctx.fillStyle = '#5f6368';
  ctx.font = '16px Geist, Arial, sans-serif';
  ctx.fillText(`${report.system.productName ?? 'Device'} · Generated ${report.system.reportTime.slice(0, 10)}`, 116, y);
  y += 58;

  ctx.fillStyle = '#101215';
  ctx.font = '500 92px Geist, Arial, sans-serif';
  ctx.fillText(analysis.healthPercent === null ? 'Not reported' : `${analysis.healthPercent}%`, 116, y);
  ctx.fillStyle = '#5f6368';
  ctx.font = '18px Geist, Arial, sans-serif';
  ctx.fillText(analysis.verdict, 120, y + 34);
  y += 74;

  const metrics = [
    ['Full-charge capacity', formatWh(analysis.fullChargeMwh)],
    ['Design capacity', formatWh(analysis.designMwh)],
    ['Estimated runtime', analysis.runtimeHours === null ? 'Not enough data' : `${analysis.runtimeHours.toFixed(1)} h`],
    ['Battery use', analysis.batteryShare === null ? 'Not enough data' : `${analysis.batteryShare}% of active time`],
    ['Cycle count', report.batteries[0]?.cycleCount ?? 'Not reported'],
    ['Capacity history', `${analysis.capacity.length} periods`],
  ];
  const cardWidth = 374;
  const gap = 22;
  metrics.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 116 + col * (cardWidth + gap);
    const top = y + row * 102;
    ctx.fillStyle = '#f2f4f7';
    ctx.fillRect(x, top, cardWidth, 80);
    ctx.fillStyle = '#5f6368';
    ctx.font = '15px Geist, Arial, sans-serif';
    ctx.fillText(String(label), x + 18, top + 26);
    ctx.fillStyle = '#101215';
    ctx.font = '500 22px Geist, Arial, sans-serif';
    ctx.fillText(String(value), x + 18, top + 59, cardWidth - 36);
  });
  y += 226;

  const drawSection = (title: string, paragraphs: string[]) => {
    if (!paragraphs.length) return;
    ctx.fillStyle = '#101215';
    ctx.font = '600 20px Geist, Arial, sans-serif';
    ctx.fillText(title, 116, y);
    y += 28;
    ctx.fillStyle = '#34383e';
    ctx.font = '16px Geist, Arial, sans-serif';
    for (const paragraph of paragraphs) {
      const lines = wrappedLines(ctx, `• ${paragraph}`, 1130);
      for (const line of lines) {
        ctx.fillText(line, 120, y);
        y += 24;
      }
      y += 5;
    }
    y += 14;
  };

  if (ai) {
    drawSection('AI overview', [ai.summary]);
    drawSection('Findings', ai.findings);
    drawSection('Recommendations', ai.recommendations);
    drawSection('Limitations', ai.limitations);
  } else drawSection('Measured observations', analysis.observations);
  drawSection('Data coverage', [
    `${analysis.drains.length} active battery discharge sessions, ${analysis.capacity.length} capacity periods, and ${analysis.usage.length} usage periods were read from this report.`,
    'Numeric measurements are calculated from the uploaded Windows report. AI interpretation is generated separately.',
  ]);
  ctx.fillStyle = '#686d74';
  ctx.font = '13px Geist, Arial, sans-serif';
  ctx.fillText(`Source: ${report.source.fileName} · Gauge · ${new Date().toLocaleDateString()}`, 116, canvas.height - 78);

  const url = canvas.toDataURL('image/png');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'gauge-battery-report.png';
  anchor.click();
}
