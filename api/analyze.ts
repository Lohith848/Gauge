import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGroqRequest } from '../src/server/groq-handler.ts';

export default function analyzeHandler(req: IncomingMessage, res: ServerResponse) {
  return handleGroqRequest(req, res);
}
