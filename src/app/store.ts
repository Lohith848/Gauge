import { create } from 'zustand';
import type { BatteryReport, ParseError } from '../lib/report/types';
import { analyze, type Analysis } from '../lib/analysis';
import { makeParseError, parseFile } from '../lib/report';
interface GaugeState {
  report: BatteryReport | null; analysis: Analysis | null; error: ParseError | null; loading: boolean;
  fileName: string | null; setFile: (file: File) => Promise<void>; setReport: (report: BatteryReport) => void; clear: () => void; loadSample: () => Promise<void>;
}
export const useGaugeStore = create<GaugeState>((set) => ({
  report: null, analysis: null, error: null, loading: false, fileName: null,
  setFile: async (file) => {
    set({ loading: true, error: null, fileName: file.name });
    try {
      const result = await parseFile(file);
      set(result.ok ? { report: result.value, analysis: analyze(result.value), loading: false, error: null } : { report: null, analysis: null, error: result.error, loading: false });
    } catch {
      set({ report: null, analysis: null, error: makeParseError('E_NOT_BATTERY_REPORT'), loading: false });
    }
  },
  setReport: (report) => set({ report, analysis: analyze(report), error: null, loading: false, fileName: report.source.fileName }),
  clear: () => set({ report: null, analysis: null, error: null, fileName: null, loading: false }),
  loadSample: async () => {
    const response = await fetch('/sample/sample-report.html');
    const content = await response.text();
    await useGaugeStore.getState().setFile(new File([content], 'sample-battery-report.html', { type: 'text/html' }));
  },
}));
