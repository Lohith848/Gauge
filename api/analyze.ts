import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGroqRequest } from '../src/server/groq-handler.ts';

export default function analyzeHandler(req: IncomingMessage, res: ServerResponse) {
  return handleGroqRequest(req, res).catch((error: unknown) => {
    console.error('[api/analyze] Unhandled request failure', { name: error instanceof Error ? error.name : 'UnknownError' });
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
    }
    res.end(JSON.stringify({ error: 'The AI analysis endpoint failed unexpectedly. Please retry. Your calculated battery metrics are still available.' }));
  });
}
