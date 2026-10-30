import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function analyzeHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Keep the API entrypoint independently loadable so an initialization failure
    // is returned as JSON instead of Vercel's generic HTML server-error page.
    const { handleGroqRequest } = await import('../src/server/groq-handler');
    await handleGroqRequest(req, res);
  } catch (error: unknown) {
    console.error('[api/analyze] Unhandled request failure', { name: error instanceof Error ? error.name : 'UnknownError' });
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
    }
    res.end(JSON.stringify({ error: 'The AI analysis endpoint failed unexpectedly. Please retry. Your calculated battery metrics are still available.' }));
  }
}

