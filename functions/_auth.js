/**
 * Shared admin auth for the Pages Functions.
 *
 * The password is NEVER stored in this repository in plaintext. What ships is a
 * SHA-256 digest of it, and the check is a constant-time comparison of digests.
 * That means a copy of this repo does not hand anyone the password.
 *
 * It is still a single shared secret over a digest with no salt or KDF, so it is
 * only as strong as the password itself. To rotate it, or to move it out of the
 * repo entirely, set one of these in the Cloudflare Pages project
 * (Settings -> Environment variables, "Encrypt" it):
 *
 *   ADMIN_PASSWORD_SHA256   hex digest, preferred
 *   ADMIN_PASSWORD          plaintext, hashed here at request time
 *
 * Either env var takes precedence over the baked-in digest below.
 */

const FALLBACK_SHA256 =
  'd13ebae478074b5b88d9a139b3d9265d6db4fd04f5c70759e487576a39fcf2c8';

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Compare without leaking how many leading characters matched. Both inputs are
   fixed-length hex digests here, so length is not secret. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(env, supplied) {
  if (typeof supplied !== 'string' || supplied === '') return false;

  let expected = (env.ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
  if (!expected && env.ADMIN_PASSWORD) expected = await sha256Hex(env.ADMIN_PASSWORD);
  if (!expected) expected = FALLBACK_SHA256;

  return timingSafeEqual(await sha256Hex(supplied), expected);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* An admin API must never be cached by a browser or by Cloudflare's edge. */
      'Cache-Control': 'no-store',
    },
  });
}
