// Cloudflare Pages Functions catchall fallback
import worker from '../_worker.js';

export async function onRequest(context) {
  return worker.fetch(context.request, context.env, context);
}
