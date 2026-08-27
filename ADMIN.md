# The leads dashboard (`/admin`)

The quote form on the site now posts to a real endpoint, submissions are stored,
and `https://<site>/admin` lists them behind a password.

| Piece | File |
| --- | --- |
| Intake endpoint (`POST /api/lead`) | `functions/api/lead.js` |
| Admin endpoint (`POST /api/leads`) | `functions/api/leads.js` |
| Password check | `functions/_auth.js` |
| The dashboard page | `admin.html` → served at `/admin` |
| Database schema | `schema.sql` |

---

## Cloudflare setup — already done

The database exists, the table exists, the binding is attached to both the
Production and Preview environments, and the deployment carrying it is live. It
was verified in production: the site's own form was submitted, the lead appeared
at `/admin`, and the test row was then deleted (the table is empty).

| Thing | Value |
| --- | --- |
| D1 database | `clearview-leads` |
| Database id | `4b086ac0-0c13-4e63-b112-f69715106b19` |
| Binding variable | `DB` (Production **and** Preview) |

Note that the **Functions only run on Cloudflare Pages.** The GitHub Pages copy
of this site is static hosting with no server, so the form and `/admin` will not
work there. Use the `.pages.dev` URL (or the custom domain once it points at
Cloudflare).

The steps below are recorded only in case the database ever has to be rebuilt.

### Rebuilding from scratch

**1. Create the database**

```bash
npx wrangler login
```

```bash
npx wrangler d1 create clearview-leads
```

**2. Create the table**

```bash
npx wrangler d1 execute clearview-leads --remote --file=./schema.sql
```

**3. Bind it to the Pages project**

Cloudflare dashboard → **Workers & Pages** → *clear-view-pressure-washing* →
**Settings** → **Bindings** → **Add** → **D1 database**:

| Field | Value |
| --- | --- |
| Variable name | `DB` |
| D1 database | `clearview-leads` |

Add it for **both** Production and Preview, then redeploy (Deployments → the
latest → *Retry deployment*). Bindings only attach at deploy time, so an
existing deployment will not pick one up on its own.

Until that binding exists, `/api/lead` answers `503` and the visitor is told to
phone instead — the form never pretends a lead was saved.

---

## The password

`Clearleads904!`

It is **not** stored in this repository. What ships in `functions/_auth.js` is a
SHA-256 digest of it, compared in constant time on the server. A copy of the
repo does not hand anyone the password.

Be clear about what this is and is not:

- The check is server-side. No lead data is ever sent to a browser that has not
  passed it, so it is a real gate, not a JavaScript curtain.
- It is still **one shared password with no account system and no lockout**.
  Failed attempts are slowed by 600 ms, which is enough to make guessing at
  scale impractical, but anyone who learns the password has the full list.
- The digest is unsalted and has no KDF, so it is only as strong as the password
  itself against an offline attack on the repo.

That is an appropriate amount of security for a list of names, phone numbers and
"my driveway is dirty". It would **not** be appropriate for payment details,
and nothing on this site collects any.

**To change it**, do not edit the digest by hand. Set an environment variable in
the Pages project (Settings → Variables and Secrets, *Encrypt* it) — either one
works, and either overrides the built-in digest:

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | the new password, in plaintext |
| `ADMIN_PASSWORD_SHA256` | its hex SHA-256 digest (preferred — the plaintext never touches Cloudflare) |

To compute a digest:

```bash
printf 'the-new-password' | sha256sum
```

---

## Using it

Go to `/admin`, enter the password. You get every submission, newest first:

- name, time received, click-to-call phone number, address, and what they wrote
- a search box that filters across all of those
- **Mark as handled**, which dims a lead once it has been called back

The password is held in `sessionStorage`, so it survives a page refresh but is
gone the moment the tab closes. On a shared phone, closing the tab logs out.

`/admin` is `noindex` in three places (meta tag, `X-Robots-Tag` header,
`robots.txt`) and is served `Cache-Control: no-store`, as is `/api/*`.

---

## Running it locally

The static server (`npm run serve`) cannot run Functions. Use the Pages one:

```bash
cp wrangler.example.toml wrangler.toml
```

```bash
npm run db:init:local
```

```bash
npm run dev
```

That serves the built site plus the Functions on <http://localhost:8788>, backed
by a local SQLite file under `.wrangler/`. Nothing you submit locally reaches the
live database.

`wrangler.toml` is gitignored so local experiments never change what deploys.

---

## Getting the data out

```bash
npx wrangler d1 execute clearview-leads --remote --json \
  --command "SELECT * FROM leads ORDER BY created_at DESC"
```

D1 is backed up by Cloudflare with point-in-time recovery, but if this list ever
becomes the only record of a customer, export it somewhere the business
controls.
