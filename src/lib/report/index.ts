import { makeParseError } from './errors';
import { windowsHtmlAdapter } from './adapters/windows-html';
import { windowsXmlAdapter } from './adapters/windows-xml';
import type { BatteryReport, Result, SourceMeta, ParseError } from './types';
export { makeParseError } from './errors';
export type * from './types';
export function parseReport(text: string, meta: SourceMeta): Result<BatteryReport, ParseError> {
  if (!text.trim()) return { ok: false, error: makeParseError('E_EMPTY') };
  const adapters = [windowsXmlAdapter, windowsHtmlAdapter];
  for (const adapter of adapters) if (adapter.canParse(text)) return adapter.parse(text, meta);
  return { ok: false, error: makeParseError('E_NOT_BATTERY_REPORT') };
}
export function decodeReport(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  return new TextDecoder('utf-8').decode(bytes);
}
export async function parseFile(file: File): Promise<Result<BatteryReport, ParseError>> {
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: makeParseError('E_TOO_LARGE') };
  const accepted = /\.(html?|xml)$/i.test(file.name) || file.type === 'text/html';
  if (!accepted) return { ok: false, error: makeParseError('E_UNSUPPORTED_TYPE') };
  if (/\.xml$/i.test(file.name) || file.type === 'application/xml' || file.type === 'text/xml') return { ok: false, error: makeParseError('E_UNSUPPORTED_FORMAT') };
  const buffer = await file.arrayBuffer();
  return parseReport(decodeReport(buffer), { fileName: file.name, fileSizeBytes: file.size, format: 'windows-html' });
}
