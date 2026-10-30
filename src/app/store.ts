import { create } from 'zustand';
import type { BatteryReport, ParseError } from '../lib/report/types';
import { analyze, type Analysis } from '../lib/analysis';
import { makeParseError, parseFile } from '../lib/report';
import { clearCachedReport, readCachedReport, saveCachedAi, saveCachedReport } from '../lib/cache/report-cache';
import { requestAiReport } from '../lib/ai/client';
import type { AiReport } from '../lib/ai/types';

type AiStatus = 'idle' | 'loading' | 'complete' | 'error';
type CacheStatus = 'loading' | 'saved' | 'missing' | 'unavailable';

interface GaugeState {
  report: BatteryReport | null;
  analysis: Analysis | null;
  aiReport: AiReport | null;
  aiStatus: AiStatus;
  aiError: string | null;
  error: ParseError | null;
  loading: boolean;
  cacheStatus: CacheStatus;
  cacheWarning: string | null;
  fileName: string | null;
  restoreCache: () => Promise<void>;
  setFile: (file: File) => Promise<void>;
  analyzeWithAi: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useGaugeStore = create<GaugeState>((set, get) => ({
  report: null,
  analysis: null,
  aiReport: null,
  aiStatus: 'idle',
  aiError: null,
  error: null,
  loading: false,
  cacheStatus: 'loading',
  cacheWarning: null,
  fileName: null,

  restoreCache: async () => {
    try {
      const cached = await readCachedReport();
      if (!cached) {
        set({ cacheStatus: 'missing' });
        return;
      }
      const file = new File([cached.file], cached.fileName, { type: cached.fileType, lastModified: cached.lastModified });
      const result = await parseFile(file);
      if (!result.ok) {
        await clearCachedReport();
        set({ cacheStatus: 'missing', error: result.error });
        return;
      }
      const analysis = analyze(result.value);
      set({ report: result.value, analysis, aiReport: cached.ai, aiStatus: cached.ai ? 'complete' : 'idle', fileName: file.name, cacheStatus: 'saved' });
      if (!cached.ai) void get().analyzeWithAi();
    } catch {
      set({ cacheStatus: 'unavailable', cacheWarning: 'Browser storage is unavailable. This report will not be restored after you close the tab.' });
    }
  },

  setFile: async (file) => {
    set({ loading: true, error: null, aiReport: null, aiStatus: 'idle', aiError: null, cacheWarning: null, fileName: file.name });
    try {
      const result = await parseFile(file);
      if (!result.ok) {
        set({ report: null, analysis: null, loading: false, error: result.error, fileName: null });
        return;
      }
      const analysis = analyze(result.value);
      let cacheStatus: CacheStatus = 'saved';
      let cacheWarning: string | null = null;
      try {
        await saveCachedReport(file);
      } catch {
        cacheStatus = 'unavailable';
        cacheWarning = 'This report was read, but the browser could not cache it. It will not be restored after you close the tab.';
      }
      set({ report: result.value, analysis, loading: false, error: null, cacheStatus, cacheWarning });
      void get().analyzeWithAi();
    } catch {
      set({ report: null, analysis: null, error: makeParseError('E_NOT_BATTERY_REPORT'), loading: false, fileName: null });
    }
  },

  analyzeWithAi: async () => {
    const { report, analysis } = get();
    if (!report || !analysis) return;
    set({ aiStatus: 'loading', aiError: null });
    try {
      const aiReport = await requestAiReport(report, analysis);
      set({ aiReport, aiStatus: 'complete' });
      try {
        await saveCachedAi(aiReport);
      } catch {
        set({ cacheWarning: 'AI analysis is ready, but could not be saved in browser storage.' });
      }
    } catch (error) {
      set({ aiStatus: 'error', aiError: error instanceof Error ? error.message : 'AI analysis failed.' });
    }
  },

  clear: async () => {
    set({ report: null, analysis: null, aiReport: null, aiStatus: 'idle', aiError: null, error: null, loading: false, fileName: null, cacheStatus: 'missing', cacheWarning: null });
    try {
      await clearCachedReport();
    } catch {
      set({ cacheWarning: 'The report was cleared from this view, but browser storage could not be cleared.' });
    }
  },
}));
