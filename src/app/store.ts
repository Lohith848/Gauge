import { create } from 'zustand';
import type { BatteryReport, ParseError } from '../lib/report/types';
import { analyze, type Analysis } from '../lib/analysis';
import { makeParseError, parseReport } from '../lib/report';
import { requestAiReport } from '../lib/ai/client';
import type { AiReport } from '../lib/ai/types';

type AiStatus = 'idle' | 'loading' | 'complete' | 'error';
export type LoadingStage = 'reading' | 'parsing' | 'extracting' | 'calculating' | 'graphs' | 'analyzing' | 'ready' | null;
interface GaugeState {
  report: BatteryReport | null;
  analysis: Analysis | null;
  aiReport: AiReport | null;
  aiStatus: AiStatus;
  aiError: string | null;
  error: ParseError | null;
  loading: boolean;
  loadingStage: LoadingStage;
  fileName: string | null;
  setFile: (file: File) => Promise<void>;
  analyzeWithAi: () => Promise<void>;
  clear: () => void;
}

const paint = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

export const useGaugeStore = create<GaugeState>((set, get) => ({
  report: null,
  analysis: null,
  aiReport: null,
  aiStatus: 'idle',
  aiError: null,
  error: null,
  loading: false,
  loadingStage: null,
  fileName: null,

  setFile: async (file) => {
    set({ loading: true, loadingStage: 'reading', error: null, report: null, analysis: null, aiReport: null, aiStatus: 'idle', aiError: null, fileName: file.name });
    try {
      if (file.size > 10 * 1024 * 1024) {
        set({ error: makeParseError('E_TOO_LARGE'), loading: false, loadingStage: null, fileName: null });
        return;
      }
      if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
        set({ error: makeParseError('E_UNSUPPORTED_TYPE'), loading: false, loadingStage: null, fileName: null });
        return;
      }
      await paint();
      const text = await file.text();
      set({ loadingStage: 'parsing' });
      await paint();
      set({ loadingStage: 'extracting' });
      const result = parseReport(text, { fileName: file.name, fileSizeBytes: file.size, format: 'windows-html' });
      if (!result.ok) {
        set({ report: null, analysis: null, loading: false, loadingStage: null, error: result.error, fileName: null });
        return;
      }
      set({ loadingStage: 'calculating' });
      await paint();
      const analysis = analyze(result.value);
      set({ report: result.value, analysis, loadingStage: 'graphs', error: null });
      await paint();
      await get().analyzeWithAi();
    } catch {
      set({ report: null, analysis: null, error: makeParseError('E_NOT_BATTERY_REPORT'), loading: false, loadingStage: null, fileName: null });
    }
  },

  analyzeWithAi: async () => {
    const { analysis } = get();
    if (!analysis) return;
    set({ aiStatus: 'loading', aiError: null, loading: true, loadingStage: 'analyzing' });
    try {
      const aiReport = await requestAiReport(analysis);
      set({ aiReport, aiStatus: 'complete' });
    } catch (error) {
      set({ aiStatus: 'error', aiError: error instanceof Error ? error.message : 'AI analysis failed.' });
    } finally {
      set({ loadingStage: 'ready' });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      set({ loading: false, loadingStage: null });
    }
  },

  clear: () => set({ report: null, analysis: null, aiReport: null, aiStatus: 'idle', aiError: null, error: null, loading: false, loadingStage: null, fileName: null }),
}));
