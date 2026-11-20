/*
 * Vercel Serverless Function — POST /api/fh-delete
 * Removes a single matchup row from the archive (the "Del" button on
 * analysis.html). Also removes the parent snapshot when its last matchup
 * is gone, so the archive never accumulates orphaned snapshot headers.
 *
 * Body: { id }
 */

export const config = { runtime: 'nodejs' };

import {
  sqlExec, readConnectionString, checkArchiveKey, sameOriginOrNone, intOrNull,
} from './_lib/neon.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOriginOrNone(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  if (!checkArchiveKey(req)) return res.status(401).json({ error: 'Invalid archive key' });

  const conn = readConnectionString();
  if (!conn) return res.status(500).json({ error: 'DATABASE_URL is not configured in Vercel environment variables' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const id = intOrNull(body.id, 1, 9223372036854770000);
  if (id === null) return res.status(400).json({ error: 'Valid matchup id required' });

  try {
    const gone = await sqlExec(conn, 'DELETE FROM fh_matchups WHERE id = $1 RETURNING id, snapshot_id, home_team, away_team', [id]);
    if (!gone.length) return res.status(404).json({ error: `Matchup id ${id} not found` });
    const snap = gone[0].snapshot_id;
    let orphans = 0;
    if (snap !== null && snap !== undefined) {
      const removed = await sqlExec(conn, `
        DELETE FROM fh_snapshots WHERE id = $1
          AND NOT EXISTS (SELECT 1 FROM fh_matchups WHERE snapshot_id = $1)
        RETURNING id
      `, [snap]);
      orphans = removed.length;
    }
    return res.status(200).json({ ok: true, deleted: gone[0], orphan_snapshots_removed: orphans });
  } catch (e) {
    return res.status(502).json({ error: 'Delete failed', detail: e.message });
  }
}
