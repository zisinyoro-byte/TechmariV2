/*
 * Vercel Serverless Function — GET /api/fh-archive
 * Reads saved matchups (+ snapshot provenance) for analysis.html only.
 * The Techmari app never calls this. Query params (all optional):
 *   league, from, to (YYYY-MM-DD), settled (yes|no|all), fast (1 = both fast starters),
 *   above (1 = both above league average), conf (HIGH|MEDIUM|LOW), limit (<=1000).
 */

export const config = { runtime: 'nodejs' };

import {
  sqlExec, readConnectionString, checkArchiveKey, sameOriginOrNone, intOrNull,
} from './_lib/neon.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOriginOrNone(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  if (!checkArchiveKey(req)) return res.status(401).json({ error: 'Invalid archive key' });

  const conn = readConnectionString();
  if (!conn) return res.status(500).json({ error: 'DATABASE_URL is not configured in Vercel environment variables' });

  const q = req.query || {};
  const where = [];
  const params = [];
  const add = (clause, value) => { params.push(value); where.push(clause.replace(/\$(\d+)/, `$${params.length}`)); };

  if (q.league) { params.push(String(q.league).slice(0, 200)); where.push(`m.league ILIKE $${params.length}`); }
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) { params.push(q.from); where.push(`m.match_date_iso >= $${params.length}`); }
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) { params.push(q.to); where.push(`m.match_date_iso <= $${params.length}`); }
  if (q.settled === 'yes') where.push('m.settled_at IS NOT NULL');
  if (q.settled === 'no') where.push('m.settled_at IS NULL');
  if (q.fast === '1') where.push('m.host_fast_starter = true AND m.visitor_fast_starter = true');
  if (q.above === '1') where.push('m.host_above_avg = true AND m.visitor_above_avg = true');
  if (q.conf && ['HIGH', 'MEDIUM', 'LOW'].includes(String(q.conf).toUpperCase())) {
    params.push(String(q.conf).toUpperCase()); where.push(`m.confidence = $${params.length}`);
  }

  const limitRaw = intOrNull(q.limit, 1, 1000);
  const limit = limitRaw === null ? 500 : limitRaw;

  const sql = `
    SELECT m.*,
           s.source_url, s.source_type, s.source_date, s.parser_version, s.saved_at
      FROM fh_matchups m
      JOIN fh_snapshots s ON s.id = m.snapshot_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.match_date_iso DESC NULLS LAST, m.id DESC
     LIMIT ${limit}
  `;

  try {
    const rows = await sqlExec(conn, sql, params);
    return res.status(200).json({ ok: true, count: rows.length, rows });
  } catch (e) {
    return res.status(502).json({ error: 'Archive query failed', detail: e.message });
  }
}
