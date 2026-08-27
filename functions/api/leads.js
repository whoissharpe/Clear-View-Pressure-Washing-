/**
 * POST /api/leads - returns stored submissions for the /admin page.
 *
 * POST rather than GET on purpose: the password travels in a JSON body, so it
 * never lands in a URL, a browser history entry, a referrer header or an edge
 * access log the way a query string would.
 */
import { checkPassword, json } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }

  if (!(await checkPassword(env, body && body.password))) {
    /* A deliberate delay: this is a single shared password with no lockout, so
       slowing each attempt is the main thing standing between it and a script. */
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: 'Incorrect password.' }, 401);
  }

  if (!env.DB) {
    return json({ error: 'Lead storage is not configured (missing D1 binding "DB").' }, 503);
  }

  /* Mark-as-handled: same password, same endpoint, so the admin page needs no
     second round of auth. */
  if (body.action === 'handled' && Number.isInteger(body.id)) {
    await env.DB.prepare('UPDATE leads SET handled = ? WHERE id = ?')
      .bind(body.handled ? 1 : 0, body.id).run();
  }

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, name, phone, address, service, message, handled
     FROM leads ORDER BY created_at DESC LIMIT 500`
  ).all();

  return json({ ok: true, leads: results || [] });
}
