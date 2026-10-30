const WS = /[\s\u00A0\u202F]+/g;
export const normalize = (s: string | null | undefined): string => (s ?? '').replace(WS, ' ').trim();
export const isNullText = (s: string): boolean => s === '' || s === '-';
export function parseHms(raw: string): number | null {
  const s = normalize(raw); if (isNullText(s)) return null;
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
export function parseFirstInt(raw: string): number | null {
  const s = normalize(raw); if (isNullText(s)) return null;
  const m = /\d[\d.,\u00A0\u202F ]*/.exec(s); if (!m) return null;
  const digits = m[0].replace(/\D/g, ''); return digits ? Number(digits) : null;
}
export const parseMwh = parseFirstInt;
export const parsePercent = parseFirstInt;
export function findDates(raw: string): string[] { return normalize(raw).match(/\d{4}-\d{2}-\d{2}/g) ?? []; }
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export function parseUtcOffset(raw: string | null): number | null {
  if (!raw) return null; const m = /^([+-])(\d{1,2}):(\d{2})$/.exec(raw.trim()); if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3]); return m[1] === '-' ? -mins : mins;
}
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}
export function formatWh(mwh: number | null): string { return mwh === null ? '—' : `${(mwh / 1000).toFixed(1)} Wh`; }
