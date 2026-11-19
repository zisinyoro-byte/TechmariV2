-- FH Archive schema (Neon Postgres) — one-way capture + post-match results.
-- Run once in the Neon SQL editor against the MAIN branch.
-- Nothing in the Techmari app ever reads strategy data from these tables;
-- only /api/fh-save (write), /api/fh-archive (read) and /api/fh-settle (results) touch them.

CREATE TABLE IF NOT EXISTS fh_snapshots (
  id             BIGSERIAL PRIMARY KEY,
  league         TEXT        NOT NULL,
  source_url     TEXT        NOT NULL DEFAULT '',
  source_type    TEXT,                       -- 'soccerstats auto-fetch' | 'manual paste'
  source_date    DATE        NOT NULL,       -- UK day the tables were processed (dedupe key part)
  table_counts   JSONB,                      -- rows contributed by each of the six tables
  baselines      JSONB,                      -- {fh, sh, htDraw} league baselines at save time
  parser_version TEXT,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same league + same source page + same day = same snapshot; re-save updates it.
CREATE UNIQUE INDEX IF NOT EXISTS fh_snapshots_key
  ON fh_snapshots (league, source_url, source_date);

CREATE TABLE IF NOT EXISTS fh_matchups (
  id             BIGSERIAL PRIMARY KEY,
  snapshot_id    BIGINT NOT NULL REFERENCES fh_snapshots(id) ON DELETE CASCADE,

  -- Fixture identity
  match_date     TEXT,                       -- as shown in the app (DD/MM/YYYY or similar)
  match_date_iso DATE,                       -- parsed for sorting/filtering (null if unparseable)
  round          TEXT,
  league         TEXT,
  home_team      TEXT   NOT NULL,
  away_team      TEXT   NOT NULL,

  -- Prediction core
  exp_fh_goals   REAL   NOT NULL,            -- (host venue rate + visitor venue rate) / 2
  confidence     TEXT   NOT NULL,            -- HIGH | MEDIUM | LOW
  fh_match_flag  BOOLEAN NOT NULL DEFAULT false,  -- FH MATCH badge (exp >= 1.50)
  lean_note      TEXT,                       -- 'Over 0.5 FH / FH BTTS lean' when flagged

  -- Host numbers (mirrors the Selected Matchup card exactly)
  host_fh_gpm_venue   REAL,                  -- FH goals/match at host venue
  host_rate_source    TEXT,                  -- 'Home table' | 'Overall fallback'
  host_venue_gp       INTEGER,
  host_fh_gpm_overall REAL,
  host_hot            BOOLEAN,               -- FH HOT: overall >= 1.50
  host_1h_share_pct   REAL,                  -- fast-starter test (>= 55%)
  host_2h_gpm         REAL,
  host_ht_draw_pct    REAL,
  host_ht_lead_pct    REAL,
  host_ht_trail_pct   REAL,
  host_ht_scoreless_pct REAL,
  host_ht_2plus_pct   REAL,
  host_ht_cs_pct      REAL,

  -- Visitor numbers (same set)
  visitor_fh_gpm_venue   REAL,
  visitor_rate_source    TEXT,
  visitor_venue_gp       INTEGER,
  visitor_fh_gpm_overall REAL,
  visitor_hot            BOOLEAN,
  visitor_1h_share_pct   REAL,
  visitor_2h_gpm         REAL,
  visitor_ht_draw_pct    REAL,
  visitor_ht_lead_pct    REAL,
  visitor_ht_trail_pct   REAL,
  visitor_ht_scoreless_pct REAL,
  visitor_ht_2plus_pct   REAL,
  visitor_ht_cs_pct      REAL,

  -- League context ("above league average" checks)
  league_fh_avg     REAL,
  league_2h_avg     REAL,
  league_ht_draw_pct REAL,
  host_fast_starter   BOOLEAN,               -- host_1h_share_pct >= 55
  visitor_fast_starter BOOLEAN,
  host_above_avg      BOOLEAN,               -- host overall FH rate >= league_fh_avg
  visitor_above_avg   BOOLEAN,
  splits_derived      JSONB,                 -- which tables were pasted vs auto-derived
  above_avg_detail    JSONB,                 -- overall + venue comparisons per team
  verdict_badges      JSONB,                 -- full badge list shown on the card
  extras              JSONB,                 -- raw insight objects (future-proofing)

  -- Bet line (option a): stored at save time, judged automatically
  bet_line        REAL,                      -- e.g. 1.5 = Over 1.5 first-half goals; integer lines push (VOID) on exact hits
  bet_market      TEXT    NOT NULL DEFAULT 'FH_OVER',  -- FH_OVER (vs bet_line) | FH_BTTS
  result_bet      TEXT,                      -- WIN | LOSS | VOID (auto from actual scores vs line)

  -- Post-match results (filled from analysis.html after the games)
  actual_fh_home  INTEGER,                   -- half-time home goals
  actual_fh_away  INTEGER,                   -- half-time away goals
  result_over05   TEXT,                      -- WIN | LOSS (auto from actual scores)
  result_fh_btts  TEXT,                      -- WIN | LOSS (auto from actual scores)
  result_manual   TEXT,                      -- WIN | LOSS | VOID (optional override)
  settled_at      TIMESTAMPTZ,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (snapshot_id, home_team, away_team)
);

CREATE INDEX IF NOT EXISTS fh_matchups_date_idx   ON fh_matchups (match_date_iso);
CREATE INDEX IF NOT EXISTS fh_matchups_league_idx ON fh_matchups (league);
CREATE INDEX IF NOT EXISTS fh_matchups_settled_idx ON fh_matchups (settled_at);
