/*
 * Vercel Serverless Function — POST /api/fh-settle
 * Called from analysis.html after the games are played: stores the actual
 * half-time score and derives the WIN/LOSS results for the two markets the
 * FH MATCH badge leans on (Over 0.5 FH goals, FH BTTS). result_manual allows
 * a WIN/LOSS/VOID override for any other market.
 * Sending no scores and no manual result clears the settlement (un-settle).
 *
 * Body: { id, actual_fh_home?, actual_fh_away?, result_manual?, bet_line?, bet_market?, odds?, notes? }
 */

export const config = { runtime: 'nodejs' };

import {
  sqlExec, readConnectionString, checkArchiveKey, sameOriginOrNone, intOrNull, strOrNull, numOrNull,
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

  const h = intOrNull(body.actual_fh_home, 0, 20);
  const a = intOrNull(body.actual_fh_away, 0, 20);
  const manual = strOrNull(body.result_manual, 10);
  if (manual !== null && !['WIN', 'LOSS', 'VOID'].includes(manual.toUpperCase())) {
    return res.status(400).json({ error: 'result_manual must be WIN, LOSS or VOID' });
  }
  const notes = strOrNull(body.notes, 500);
  const lineIn = numOrNull(body.bet_line, 0, 15);
  const marketIn = strOrNull(body.bet_market, 12);
  if (marketIn !== null && !['FH_OVER', 'FH_BTTS'].includes(marketIn.toUpperCase())) {
    return res.status(400).json({ error: 'bet_market must be FH_OVER or FH_BTTS' });
  }
  const oddsIn = numOrNull(body.odds, 1.01, 100);

  const hasScores = h !== null || a !== null;
  // Clear only when the request carries nothing at all (the Clear button sends { id }).
  // A bet_line or odds edit alone is an update intent: it re-settles with preserved scores.
  const clearing = !hasScores && manual === null && lineIn === null && oddsIn === null;

  let row;
  try {
    if (clearing) {
      // Full un-settle: wipe scores and results, keep any notes.
      const rows = await sqlExec(conn, `
        UPDATE fh_matchups SET
          actual_fh_home = NULL, actual_fh_away = NULL,
          result_over05 = NULL, result_fh_btts = NULL, result_manual = NULL,
          result_bet = NULL,
          settled_at = NULL, updated_at = now()
        WHERE id = $1
        RETURNING id, home_team, away_team, exp_fh_goals, confidence, bet_line, bet_market, result_bet, odds,
                  actual_fh_home, actual_fh_away, result_over05, result_fh_btts,
                  result_manual, settled_at, notes
      `, [id]);
      row = rows[0];
    } else {
      // Merge with what is already stored so a manual-result-only update
      // never wipes a previously entered half-time score.
      const cur = await sqlExec(conn, 'SELECT actual_fh_home, actual_fh_away, bet_line, bet_market FROM fh_matchups WHERE id = $1', [id]);
      if (!cur.length) return res.status(404).json({ error: `Matchup id ${id} not found` });
      const hF = h !== null ? h : numOrNull(cur[0].actual_fh_home, 0, 20);
      const aF = a !== null ? a : numOrNull(cur[0].actual_fh_away, 0, 20);
      const both = hF !== null && aF !== null;
      const over05 = both ? (hF + aF >= 1 ? 'WIN' : 'LOSS') : null;
      const btts = both ? (hF >= 1 && aF >= 1 ? 'WIN' : 'LOSS') : null;
      // Option (a): the bet line was stored at save time; judge against it.
      // A client-sent bet_line edits the line; integer lines push (VOID) on exact hits.
      const line = lineIn !== null ? lineIn : numOrNull(cur[0].bet_line, 0, 15);
      const market = (marketIn || String(cur[0].bet_market || 'FH_OVER')).toUpperCase();
      let bet = null;
      if (both && line !== null) {
        if (market === 'FH_BTTS') bet = (hF >= 1 && aF >= 1) ? 'WIN' : 'LOSS';
        else bet = (hF + aF > line) ? 'WIN' : (hF + aF < line ? 'LOSS' : (Number.isInteger(line) ? 'VOID' : 'LOSS'));
      }
      const rows = await sqlExec(conn, `
        UPDATE fh_matchups SET
          actual_fh_home = $2, actual_fh_away = $3,
          result_over05 = $4, result_fh_btts = $5,
          result_manual = $6,
          result_bet = $7,
          bet_line = COALESCE($8, bet_line),
          bet_market = $9,
          notes = COALESCE($10, notes),
          odds = COALESCE($11, odds),
          settled_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING id, home_team, away_team, exp_fh_goals, confidence, bet_line, bet_market, result_bet, odds,
                  actual_fh_home, actual_fh_away, result_over05, result_fh_btts,
                  result_manual, settled_at, notes
      `, [id, hF, aF, over05, btts, manual === null ? null : manual.toUpperCase(), bet,
          lineIn, market, notes, oddsIn]);
      row = rows[0];
    }
  } catch (e) {
    return res.status(502).json({ error: 'Settle failed', detail: e.message });
  }

  if (!row) return res.status(404).json({ error: `Matchup id ${id} not found` });
  return res.status(200).json({ ok: true, row, cleared: clearing });
}
