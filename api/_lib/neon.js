/*
 * Shared helper for the fh-archive endpoints (not an endpoint itself —
 * Vercel ignores files prefixed with "_" inside /api).
 *
 * Talks to Neon over its SQL-over-HTTP endpoint with native fetch, so the
 * function bundle needs no npm dependencies (the repo has no package.json).
 * The connection string comes ONLY from the DATABASE_URL environment
 * variable set in Vercel project settings — never in client code.
 */

export function readConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return null;
  return url;
}

// POST one statement to Neon's /sql endpoint, return rows as objects.
export async function sqlExec(connString, query, params = []) {
  const u = new URL(connString);
  const host = u.hostname;
  const password = decodeURIComponent(u.password || '');
  if (!host || !password) throw new Error('DATABASE_URL is missing host or password');

  let res;
  try {
    res = await fetch(`https://${host}/sql`, {
      method: 'POST',
      // Auth matches the official @neondatabase/serverless driver: the full
      // connection string is carried in the Neon-Connection-String header.
      // No Authorization header — sending one triggers token auth and fails.
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connString,
      },
      body: JSON.stringify({ query, params }),
    });
  } catch (e) {
    throw new Error('Could not reach the Neon SQL endpoint: ' + e.message);
  }

  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { /* non-JSON error body */ }

  if (!res.ok) {
    const msg = body && (body.message || body.error) ? (body.message || body.error) : text.slice(0, 300);
    const err = new Error(`Neon SQL error ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }

  // The HTTP driver returns an array of row objects; older shapes may wrap in { rows }.
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.rows)) return body.rows;
  if (body && body.error) throw new Error('Neon SQL error: ' + body.error);
  return [];
}

// Optional shared key: if FH_ARCHIVE_KEY is set in Vercel env vars, every
// archive endpoint requires the x-archive-key header to match.
export function checkArchiveKey(req) {
  const expected = process.env.FH_ARCHIVE_KEY;
  if (!expected) return true; // not configured -> open (same-origin use)
  const got = req.headers['x-archive-key'] || req.query.archive_key || '';
  return typeof got === 'string' && got.length > 0 && got === expected;
}

export function sameOriginOrNone(req) {
  // Light CSRF guard: browsers always send Origin on cross-site POSTs.
  const origin = req.headers['origin'];
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  try { return new URL(origin).hostname === String(host).split(':')[0]; }
  catch (_) { return false; }
}

// "2026-11-21" | "21/11/2026" | "21.11.26" -> DATE string or null (day-first).
export function parseDateIso(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);
  m = str.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return isoFrom(y, +m[2], +m[1]);
  }
  return null;
}
function isoFrom(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Coerce arbitrary input to a safe number within [min, max], else null.
export function numOrNull(v, min = 0, max = 50) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 100) / 100;
  return r < min || r > max ? null : r;
}

// Coerce to integer within [min, max], else null.
export function intOrNull(v, min = 0, max = 20) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function strOrNull(v, maxLen = 300) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export function boolOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return null;
}

export function jsonOrNull(v, maxLen = 8000) {
  if (v === null || v === undefined) return null;
  let s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (_) { return null; }
  if (!s || s.length > maxLen) return null;
  try { JSON.parse(s); } catch (_) { return null; }
  return s;
}
