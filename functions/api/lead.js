/**
 * POST /api/lead - receives a quote-form submission and stores it in D1.
 *
 * This is what makes the form on the site actually go somewhere. The front end
 * posts a FormData body (see the fetch in assets/js/site.js), so a non-2xx here
 * surfaces to the visitor as "please call instead" rather than a silent success.
 */
import { json } from '../_auth.js';

const MAX = { name: 120, phone: 40, address: 200, service: 80, message: 4000 };

const clean = (v, limit) =>
  String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, limit);

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: 'Lead storage is not configured (missing D1 binding "DB").' }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected a form submission.' }, 400);
  }

  /* Honeypot. A real visitor never sees this field, so anything in it is a bot.
     Answer 200 so the bot believes it succeeded and does not retry, but write
     nothing - the client already discards these too, this is defence in depth. */
  if (clean(form.get('company'), 100) !== '') return json({ ok: true });

  const name = clean(form.get('name'), MAX.name);
  const phone = clean(form.get('phone'), MAX.phone);
  const message = clean(form.get('what') || form.get('message'), MAX.message);

  const digits = phone.replace(/\D/g, '');
  if (!name || !message || digits.length < 10 || digits.length > 11) {
    return json({ error: 'Please fill in your name, a valid phone number, and what you need.' }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO leads (created_at, name, phone, address, service, message, source, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      name,
      phone,
      clean(form.get('address'), MAX.address),
      clean(form.get('service'), MAX.service),
      message,
      clean(request.headers.get('referer'), 200),
      clean(request.headers.get('cf-connecting-ip'), 64)
    ).run();
  } catch (err) {
    /* Never report success we did not achieve - the visitor gets told to phone. */
    return json({ error: 'Could not save that. ' + (err && err.message ? err.message : '') }, 500);
  }

  return json({ ok: true });
}
