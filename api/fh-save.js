/*
 * Vercel Serverless Function — POST /api/fh-save
 * One-way capture: upserts a snapshot header + matchup rows into the Neon
 * archive. There is deliberately no data path back into the FH logic in
 * index.html — this endpoint is write-only for the app.
 *
 * Env: DATABASE_URL (Neon pooled connection string), optional FH_ARCHIVE_KEY.
 */

import {
  sqlExec, readConnectionString, checkArchiveKey, sameOriginOrNone,
  parseDateIso, numOrNull, intOrNull, strOrNull, boolOrNull, jsonOrNull,
} from './_lib/neon.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOriginOrNone(req)) return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
  if (!checkArchiveKey(req)) return res.status(401).json({ error: 'Invalid archive key' });

  const conn = readConnectionString();
  if (!conn) return res.status(500).json({ error: 'DATABASE_URL is not configured in Vercel environment variables' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const snap = body.snapshot || {};
  const matchups = Array.isArray(body.matchups) ? body.matchups : [];
  if (matchups.length === 0) return res.status(400).json({ error: 'No matchups in payload' });
  if (matchups.length > 40) return res.status(400).json({ error: 'Too many matchups in one save (max 40)' });

  let snapshotId;
  try {
    const rows = await sqlExec(conn, `
      INSERT INTO fh_snapshots (league, source_url, source_type, source_date, table_counts, baselines, parser_version)
      VALUES ($1, $2, $3, $4::date, $5::jsonb, $6::jsonb, $7)
      ON CONFLICT (league, source_url, source_date) DO UPDATE
        SET source_type = EXCLUDED.source_type,
            table_counts = EXCLUDED.table_counts,
            baselines = EXCLUDED.baselines,
            parser_version = EXCLUDED.parser_version
      RETURNING id
    `, [
      strOrNull(snap.league, 200) || 'Unknown',
      strOrNull(snap.source_url, 500) || '',
      strOrNull(snap.source_type, 60) || 'manual paste',
      parseDateIso(snap.source_date) || parseDateIso(todayIso()),
      jsonOrNull(snap.table_counts) || '{}',
      jsonOrNull(snap.baselines) || '{}',
      strOrNull(snap.parser_version, 120) || 'unknown',
    ]);
    if (!rows.length) throw new Error('Snapshot upsert returned no row');
    snapshotId = rows[0].id;
  } catch (e) {
    return res.status(502).json({ error: 'Could not store snapshot', detail: e.message });
  }

  let stored = 0;
  const errors = [];
  for (const m of matchups) {
    if (!m || typeof m !== 'object') continue;
    const home = strOrNull(m.home_team, 120);
    const away = strOrNull(m.away_team, 120);
    const exp = numOrNull(m.exp_fh_goals, 0, 15);
    if (!home || !away || exp === null) { errors.push(`Skipped row with missing home/away/expected: ${JSON.stringify(m).slice(0, 80)}`); continue; }
    try {
      const rows = await sqlExec(conn, `
        INSERT INTO fh_matchups (
          snapshot_id, match_date, match_date_iso, round, league, home_team, away_team,
          exp_fh_goals, confidence, fh_match_flag, lean_note,
          host_fh_gpm_venue, host_rate_source, host_venue_gp, host_fh_gpm_overall, host_hot,
          host_1h_share_pct, host_2h_gpm, host_ht_draw_pct, host_ht_lead_pct, host_ht_trail_pct,
          host_ht_scoreless_pct, host_ht_2plus_pct, host_ht_cs_pct,
          visitor_fh_gpm_venue, visitor_rate_source, visitor_venue_gp, visitor_fh_gpm_overall, visitor_hot,
          visitor_1h_share_pct, visitor_2h_gpm, visitor_ht_draw_pct, visitor_ht_lead_pct, visitor_ht_trail_pct,
          visitor_ht_scoreless_pct, visitor_ht_2plus_pct, visitor_ht_cs_pct,
          league_fh_avg, league_2h_avg, league_ht_draw_pct,
          host_fast_starter, visitor_fast_starter, host_above_avg, visitor_above_avg,
          splits_derived, above_avg_detail, verdict_badges, extras, bet_line, bet_market, odds,
          host_venue_tilt, visitor_venue_tilt, tilt_match
        ) VALUES (
          $1,$2,$3::date,$4,$5,$6,$7,
          $8,$9,$10,$11,
          $12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,
          $22,$23,$24,
          $25,$26,$27,$28,$29,
          $30,$31,$32,$33,$34,
          $35,$36,$37,
          $38,$39,$40,
          $41,$42,$43,$44,
          $45::jsonb,$46::jsonb,$47::jsonb,$48::jsonb,
          $49, $50, $51,
          $52, $53, $54
        )
        -- Game-scoped dedupe: the same fixture (same teams, round and date, case-insensitive)
        -- must UPDATE its existing row wherever it lives, never insert a sibling row under a
        -- new snapshot (a save session on a later day creates a new snapshot — the game is
        -- the identity, not the snapshot). Backed by uq_fh_matchups_game.
        ON CONFLICT (lower(home_team), lower(away_team), coalesce(round, ''), coalesce(match_date_iso, '0001-01-01'::date)) DO UPDATE SET
          match_date = EXCLUDED.match_date, match_date_iso = EXCLUDED.match_date_iso,
          round = EXCLUDED.round, league = EXCLUDED.league,
          -- First save wins for the prediction + decision columns: re-saving the same
          -- league/date table after matches finished must never rewrite the pre-game
          -- exp/confidence/flag or the bet the user actually took (look-ahead guard).
          exp_fh_goals = COALESCE(fh_matchups.exp_fh_goals, EXCLUDED.exp_fh_goals),
          confidence = COALESCE(fh_matchups.confidence, EXCLUDED.confidence),
          fh_match_flag = COALESCE(fh_matchups.fh_match_flag, EXCLUDED.fh_match_flag),
          lean_note = COALESCE(fh_matchups.lean_note, EXCLUDED.lean_note),
          host_fh_gpm_venue = EXCLUDED.host_fh_gpm_venue, host_rate_source = EXCLUDED.host_rate_source,
          host_venue_gp = EXCLUDED.host_venue_gp, host_fh_gpm_overall = EXCLUDED.host_fh_gpm_overall,
          host_hot = EXCLUDED.host_hot, host_1h_share_pct = EXCLUDED.host_1h_share_pct,
          host_2h_gpm = EXCLUDED.host_2h_gpm, host_ht_draw_pct = EXCLUDED.host_ht_draw_pct,
          host_ht_lead_pct = EXCLUDED.host_ht_lead_pct, host_ht_trail_pct = EXCLUDED.host_ht_trail_pct,
          host_ht_scoreless_pct = EXCLUDED.host_ht_scoreless_pct, host_ht_2plus_pct = EXCLUDED.host_ht_2plus_pct,
          host_ht_cs_pct = EXCLUDED.host_ht_cs_pct,
          visitor_fh_gpm_venue = EXCLUDED.visitor_fh_gpm_venue, visitor_rate_source = EXCLUDED.visitor_rate_source,
          visitor_venue_gp = EXCLUDED.visitor_venue_gp, visitor_fh_gpm_overall = EXCLUDED.visitor_fh_gpm_overall,
          visitor_hot = EXCLUDED.visitor_hot, visitor_1h_share_pct = EXCLUDED.visitor_1h_share_pct,
          visitor_2h_gpm = EXCLUDED.visitor_2h_gpm, visitor_ht_draw_pct = EXCLUDED.visitor_ht_draw_pct,
          visitor_ht_lead_pct = EXCLUDED.visitor_ht_lead_pct, visitor_ht_trail_pct = EXCLUDED.visitor_ht_trail_pct,
          visitor_ht_scoreless_pct = EXCLUDED.visitor_ht_scoreless_pct, visitor_ht_2plus_pct = EXCLUDED.visitor_ht_2plus_pct,
          visitor_ht_cs_pct = EXCLUDED.visitor_ht_cs_pct,
          league_fh_avg = COALESCE(fh_matchups.league_fh_avg, EXCLUDED.league_fh_avg),
          league_2h_avg = COALESCE(fh_matchups.league_2h_avg, EXCLUDED.league_2h_avg),
          league_ht_draw_pct = COALESCE(fh_matchups.league_ht_draw_pct, EXCLUDED.league_ht_draw_pct),
          host_fast_starter = EXCLUDED.host_fast_starter, visitor_fast_starter = EXCLUDED.visitor_fast_starter,
          host_above_avg = EXCLUDED.host_above_avg, visitor_above_avg = EXCLUDED.visitor_above_avg,
          host_venue_tilt = EXCLUDED.host_venue_tilt, visitor_venue_tilt = EXCLUDED.visitor_venue_tilt,
          tilt_match = EXCLUDED.tilt_match,
          splits_derived = EXCLUDED.splits_derived, above_avg_detail = EXCLUDED.above_avg_detail,
          verdict_badges = EXCLUDED.verdict_badges, extras = EXCLUDED.extras,
          bet_line = COALESCE(fh_matchups.bet_line, EXCLUDED.bet_line),
          bet_market = COALESCE(fh_matchups.bet_market, EXCLUDED.bet_market),
          odds = COALESCE(fh_matchups.odds, EXCLUDED.odds),
          updated_at = now()
        RETURNING id
      `, matchupParams(snapshotId, m, home, away, exp));
      if (rows.length) { stored++; }
    } catch (e) {
      errors.push(`${home} vs ${away}: ${e.message}`);
    }
  }

  if (stored === 0) return res.status(502).json({ error: 'No matchup rows could be stored', detail: errors.join(' | ') });
  return res.status(200).json({ ok: true, snapshot_id: snapshotId, stored, skipped: errors });
}

// ---- helpers ------------------------------------------------------------

function matchupParams(snapshotId, m, home, away, exp) {
  const leagueFH = numOrNull(m.league_fh_avg, 0, 15);
  const hostOverall = numOrNull(m.host_fh_gpm_overall, 0, 15);
  const visitOverall = numOrNull(m.visitor_fh_gpm_overall, 0, 15);
  const hostShare = numOrNull(m.host_1h_share_pct, 0, 100);
  const visitShare = numOrNull(m.visitor_1h_share_pct, 0, 100);
  const hostVenue = numOrNull(m.host_fh_gpm_venue, 0, 15);
  const visitVenue = numOrNull(m.visitor_fh_gpm_venue, 0, 15);
  const expFlag = exp >= 1.5;
  const lineIn = numOrNull(m.bet_line, 0, 15);

  return [
    snapshotId,
    strOrNull(m.match_date, 40),
    parseDateIso(m.match_date) || parseDateIso(m.match_date_iso),
    strOrNull(m.round, 60),
    strOrNull(m.league, 200),
    home,
    away,
    exp,
    strOrNull(m.confidence, 10) || 'LOW',
    boolOrNull(m.fh_match_flag) !== null ? boolOrNull(m.fh_match_flag) : expFlag,
    strOrNull(m.lean_note, 120) || (expFlag ? 'Over 0.5 FH / FH BTTS lean' : null),
    hostVenue,
    strOrNull(m.host_rate_source, 30),
    intOrNull(m.host_venue_gp, 0, 200),
    hostOverall,
    boolOrNull(m.host_hot),
    hostShare,
    numOrNull(m.host_2h_gpm, 0, 15),
    numOrNull(m.host_ht_draw_pct, 0, 100),
    numOrNull(m.host_ht_lead_pct, 0, 100),
    numOrNull(m.host_ht_trail_pct, 0, 100),
    numOrNull(m.host_ht_scoreless_pct, 0, 100),
    numOrNull(m.host_ht_2plus_pct, 0, 100),
    numOrNull(m.host_ht_cs_pct, 0, 100),
    visitVenue,
    strOrNull(m.visitor_rate_source, 30),
    intOrNull(m.visitor_venue_gp, 0, 200),
    visitOverall,
    boolOrNull(m.visitor_hot),
    visitShare,
    numOrNull(m.visitor_2h_gpm, 0, 15),
    numOrNull(m.visitor_ht_draw_pct, 0, 100),
    numOrNull(m.visitor_ht_lead_pct, 0, 100),
    numOrNull(m.visitor_ht_trail_pct, 0, 100),
    numOrNull(m.visitor_ht_scoreless_pct, 0, 100),
    numOrNull(m.visitor_ht_2plus_pct, 0, 100),
    numOrNull(m.visitor_ht_cs_pct, 0, 100),
    leagueFH,
    numOrNull(m.league_2h_avg, 0, 15),
    numOrNull(m.league_ht_draw_pct, 0, 100),
    hostShare !== null ? hostShare >= 55 : null,
    visitShare !== null ? visitShare >= 55 : null,
    hostOverall !== null && leagueFH !== null ? hostOverall >= leagueFH : null,
    visitOverall !== null && leagueFH !== null ? visitOverall >= leagueFH : null,
    jsonOrNull(m.splits_derived),
    jsonOrNull(m.above_avg_detail),
    jsonOrNull(m.verdict_badges),
    jsonOrNull(m.extras),
    lineIn !== null ? lineIn : defaultFhLine(exp),
    strOrNull(m.bet_market, 12) || 'FH_OVER',
    numOrNull(m.odds, 1.01, 100),
    strOrNull(m.host_venue_tilt, 12),
    strOrNull(m.visitor_venue_tilt, 12),
    strOrNull(m.tilt_match, 12),
  ];
}

// Option (a) default bet line: the .5 line just below expected FH goals
// (e.g. 1.62 -> Over 1.5). Integer lines push (VOID) on an exact hit.
function defaultFhLine(exp) {
  return Math.max(0.5, Math.floor(exp * 2) / 2);
}

function todayIso() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
