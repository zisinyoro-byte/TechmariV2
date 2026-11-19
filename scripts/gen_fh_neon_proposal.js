// Proposal document: Persisting FH Selected Matchup data to a Neon Postgres database.
// docx skill: Create route, report/proposal scene (Template F), cover R1 + GO-1 palette
// (long English title -> applyLongTitleOverride R4->R1), 3-section page numbering, TOC.
// Run: node scripts/gen_fh_neon_proposal.js   (needs docx: npm i docx --no-save)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  PageNumber, NumberFormat, AlignmentType, HeadingLevel, WidthType, BorderStyle,
  ShadingType, TableOfContents, PageBreak, SectionType, TableLayoutType,
} = require("docx");
const fs = require("fs");

const OUT = "/home/z/my-project/download/FH_Matchup_Neon_Persistence_Proposal.docx";

// ---- GO-1 palette (Graphite Orange - proposals) ----
const P = {
  bg: "1A2330", accent: "D4875A",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A", innerLine: "DDD0C8", surface: "F8F0EB" },
  ink: "1A2330",
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ---- Width-aware title layout (English/mixed text) - per design-system.md ----
function estimateTextWidth(text, pt) {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isCJK = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef) || (code >= 0x2e80 && code <= 0x2eff);
    width += isCJK ? pt * 20 : pt * 11;
  }
  return width;
}

function splitTitleLinesWidth(title, maxWidthTwips, pt) {
  if (estimateTextWidth(title, pt) <= maxWidthTwips) return [title];
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (estimateTextWidth(cand, pt) <= maxWidthTwips || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length <= 3) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayoutMixed(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    lines = splitTitleLinesWidth(title, maxWidthTwips, titlePt);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLinesWidth(title, maxWidthTwips, minPt); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---- Cover Recipe R1 (Pure Paragraph Left) - verbatim architecture from design-system.md ----
function buildCoverR1(config) {
  const C = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayoutMixed(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: C.accent,
        font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: C.titleColor,
        font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: C.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: C.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---- Body builders (English: left-aligned, no indent, TNR, pure black) ----
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.ink, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.ink, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
  });
}
function body(runs, opts = {}) {
  const children = (Array.isArray(runs) ? runs : [runs]).map(r =>
    typeof r === "string" ? new TextRun({ text: r, size: 24, color: "000000", font: { ascii: "Times New Roman", eastAsia: "SimSun" } })
      : new TextRun({ size: 24, color: "000000", font: { ascii: "Times New Roman", eastAsia: "SimSun" }, ...r }));
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120, line: 312 }, children, ...opts });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 160, after: 80, line: 312 },
    children: [new TextRun({ text, bold: true, size: 21, color: P.ink, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
  });
}
function cellPara(text, bold, color) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 276 },
    children: [new TextRun({ text: String(text), bold: !!bold, size: 21, color: color || "000000",
      font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}
function makeTable(headers, rows, colPcts) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((text, i) => new TableCell({
          children: [cellPara(text, true, P.table.headerText)],
          shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          width: { size: colPcts[i], type: WidthType.PERCENTAGE },
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        cantSplit: true,
        children: row.map((text, i) => new TableCell({
          children: [cellPara(text, i === 0)],
          shading: ri % 2 === 0 ? { type: ShadingType.CLEAR, fill: P.table.surface } : { type: ShadingType.CLEAR, fill: "FFFFFF" },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          width: { size: colPcts[i], type: WidthType.PERCENTAGE },
        })),
      })),
    ],
  });
}
function listItem(reference, text) {
  return new Paragraph({
    numbering: { reference, level: 0 }, spacing: { after: 100, line: 312 },
    children: [new TextRun({ text, size: 24, color: "000000", font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}

// ============================= CONTENT =============================
const bodyChildren = [];

// ---- 1. Executive Summary ----
bodyChildren.push(h1("1. Executive Summary"));
bodyChildren.push(body([
  "This proposal recommends adding a small, ",
  { text: "one-way archive", bold: true },
  " for the ",
  { text: "FH Selected Matchup - Expected First-Half Goals", bold: true },
  " panel of the Techmari V2 app, using a Neon serverless PostgreSQL database. Today every number that panel shows - the expected first-half goals value, the venue rates behind it, the confidence badge and the insight extras - exists only in the memory of the browser tab that computed it, and the only export is a manual CSV download that depends on being clicked each session. The goal is deliberately narrow: capture the pre-match snapshots into a database so that, once the games are played, the analysis can be done there. The app does not change its behaviour, never reads anything back from the database, and keeps no cache or sync of any kind; Neon is simply the shelf the snapshots sit on until they are needed for analysis.",
]));
bodyChildren.push(body([
  "The recommended mechanism reuses the architecture the app already has: the static page on Vercel gains a single Save action that posts the current panel state to one new write-only serverless function, which inserts it into Neon. Credentials live only in Vercel environment variables; the browser never sees them. A zero-change alternative exists too - the existing CSV export already contains an Expected First-Half Goals section that could be imported into Neon by hand - but it depends on manual discipline every matchday, which is exactly the step that gets skipped; Section 4.4 weighs the two. The data model separates a snapshot header (which league tables were processed, from which source, with which parser version) from the individual matchup rows, so future changes to the soccerstats page layout can never silently corrupt historical meaning.",
]));
bodyChildren.push(body([
  "The work is two short phases: provision Neon and create the schema; add the save path. Everything after that happens on the Neon side - SQL queries, saved reports or CSV download - with nothing flowing back into the app. The principal open question is confirming the current Neon free-plan limits against the projected write volume, which is tiny; the decision ask at the end of this document is approval to proceed on that basis.",
]));

// ---- 2. Current State and Problem Analysis ----
bodyChildren.push(h1("2. Current State and Problem Analysis"));
bodyChildren.push(h2("2.1 Where the panel data lives today"));
bodyChildren.push(body([
  "The Techmari V2 app is a static single page (index.html) deployed on Vercel, with three small serverless functions under /api for fetching openfootball fixtures and proxying soccerstats pages. All First-Half (FH) analytics are computed entirely client-side. The user pastes - or, until soccerstats began blocking server-side fetches in November 2026, auto-fetched - the six First/Second Half tables from a soccerstats halftime page; the Process FH Table pipeline parses them into team rows (games played, first-half goals for and against, home and away splits per match, entertaining flags) plus half-time extras (first-half share of goals, half-time draw, lead and trail records, scoreless halves, clean sheets). The Selected Matchup panel then combines the selected home and away teams into the expected FH goals figure, a confidence grade, HOT badges and verdicts.",
]));
bodyChildren.push(body([
  "Persistence today is limited to two mechanisms: browser localStorage, which remembers the last paste and the last soccerstats URL on that one device, and a manual CSV export that the user must download after each session. Neither is a database. The CSV export captures a moment in time but relies on the user remembering to click it, names files by hand, and cannot be queried or joined across leagues and weeks.",
]));
bodyChildren.push(h2("2.2 The problems this creates"));
bodyChildren.push(body([
  { text: "Volatility. ", bold: true },
  "A cleared storage, a reset via the Clear FH Data button, a new laptop or a phone browser all start from zero. Matchday work done on the desktop leaves no trace the analysis can come back to.",
]));
bodyChildren.push(body([
  { text: "No time dimension. ", bold: true },
  "The panel recomputes silently from whatever tables are currently loaded. When the same fixture is checked twice across two weeks - after new results shift the rates - the earlier prediction is overwritten and gone. Nothing can later answer the question of what the model expected before kickoff, which is the exact starting point of any after-the-games comparison the user wants to run.",
]));
bodyChildren.push(body([
  { text: "No audit trail. ", bold: true },
  "The November 2026 soccerstats redesign demonstrated how easily inputs can change meaning. A stored prediction that cannot show which tables, from which URL, parsed by which parser version, cannot be trusted in retrospect.",
]));
bodyChildren.push(h2("2.3 Why Neon fits this workload"));
bodyChildren.push(body([
  "Neon is a managed serverless PostgreSQL service: the database scales to zero between matchdays, which matches a write pattern that clusters on matchdays and is idle in between. It supports database branching, so schema changes can be tested on a branch before touching production data. Because it is plain PostgreSQL, all analysis can be done with ordinary SQL in the Neon console, and the data remains portable to any other Postgres provider if that ever becomes desirable. The user has specifically asked for Neon, and nothing in the workload argues against it; the free plan is expected to be sufficient at this volume, which is a stated assumption to verify during Phase 0 rather than a guarantee.",
]));

// ---- 3. Goals and Expected Outcomes ----
bodyChildren.push(h1("3. Goals and Expected Outcomes"));
bodyChildren.push(body([
  "The project has one goal: every prediction the user deliberately saves from the FH Selected Matchup panel becomes a durable, queryable row that survives devices, sessions and app changes. That goal decomposes into the following measurable outcomes:",
]));
bodyChildren.push(listItem("list-goals", "A save action on the panel stores the complete panel state - fixture identity, expected FH goals, confidence, venue rates and their sources, HOT flags, insight extras, verdict badges, league baseline and full provenance - within a few seconds, with a visible confirmation."));
bodyChildren.push(listItem("list-goals", "Saved data is safe from cleared localStorage, browser switches, device changes and app resets; the archive is independent of any single device."));
bodyChildren.push(listItem("list-goals", "Re-saving the same fixture from the same snapshot updates the existing row instead of duplicating it; the row records when it was first predicted and when it was last updated."));
bodyChildren.push(listItem("list-goals", "Saved rows remain interpretable months later: each carries the source URL, the paste timestamp and the parser version that produced it."));
bodyChildren.push(listItem("list-goals", "Once the games are played, the analysis runs directly in Neon: expected values can be compared with actual first-half scores using plain SQL, with any results column added on the database side only - never in the app."));
bodyChildren.push(body([
  "Equally important are the non-goals, which follow from the one-way nature of the design. The app gains no read path at all - no history view, no cache, no sync, nothing that shows saved data back to the user - and therefore no changes to how it renders or behaves. The proposal also does not introduce user accounts or authentication, does not auto-save every processed league without user intent, and does not expose any public API. Persistence is a service the app writes to, never one it reads from.",
]));

// ---- 4. Solution Design ----
bodyChildren.push(h1("4. Solution Design"));
bodyChildren.push(h2("4.1 Recommended architecture"));
bodyChildren.push(body([
  "The recommended design reuses the pattern the app already has. The browser already talks to same-origin serverless functions (the soccerstats proxy, the fixtures fetcher) whose configuration lives in Vercel environment variables; persistence follows identically, but one-way only. Exactly one new function is added to the existing Vercel project: a write endpoint that accepts a save payload as JSON and inserts it into Neon. There is deliberately no read endpoint - nothing in the app ever requests saved data back, so the archive cannot influence what the user sees. The function connects to Neon using the Neon serverless driver over HTTPS, which needs no persistent connections and suits a function that may sleep between requests. The database connection string is stored as a Vercel environment variable and is never included in client code. In production the pooled connection string is used; a separate Neon branch holds test data during setup.",
]));
bodyChildren.push(body([
  "This shape has three properties worth stating explicitly. First, the blast radius is small: the app gains one button and one additive endpoint, and its behaviour is otherwise untouched, so the regression surface is minimal for an app whose test suite already covers the FH pipeline. Second, the archive cannot leak into the user experience because there is no read path at all. Third, secrets stay server-side, matching the confidentiality rule the soccerstats proxy already follows.",
]));
bodyChildren.push(h2("4.2 What gets saved, and when"));
bodyChildren.push(body([
  "A save has two levels, stored as one snapshot header plus one or more matchup rows. The snapshot header records the context: which league, which soccerstats halftime URL or manual paste produced the tables, when the tables were processed, how many rows each of the six tables contributed, the league FH and second-half baselines, and the parser version. Each matchup row records everything the panel currently renders for one fixture - the complete field list is given in Appendix A. The default save action stores the matchup currently selected in the panel; a secondary action stores every upcoming matchup the panel lists for the loaded league (the same top-30 ordering the panel already shows).",
]));
bodyChildren.push(body([
  "Saving is explicit and user-triggered. Auto-saving on every Process FH Table click was considered and rejected: processing is exploratory - users paste leagues to browse, often several in a row - and silently persisting all of it would fill the archive with noise the user never asked to keep, diluting exactly the rows the analysis will need. The Save action makes the database mean what the user decided was worth recording.",
]));
bodyChildren.push(h2("4.3 Data model in outline"));
bodyChildren.push(body([
  "Two tables cover the design; neither is exotic. Table 1 summarises their purpose and rules. The post-match side of the analysis belongs to the database, not the app: once games are played, actual first-half scores can be recorded as a new column on the snapshot rows (or in a separate spreadsheet joined during analysis) purely on the Neon side, with no change to the capture path.",
]));
bodyChildren.push(tableTitle("Table 1: Proposed tables, purpose and integrity rules"));
bodyChildren.push(makeTable(
  ["Table", "Purpose", "Key columns (indicative)", "Integrity rule"],
  [
    ["fh_snapshots", "One row per Process FH Table that a save comes from: provenance and context", "id, league, source_url, source_type, processed_at, table_counts, baselines, parser_version", "Uniqueness by league + source URL + processed_at; re-save reuses the snapshot"],
    ["fh_matchups", "One row per saved fixture with the full panel state", "id, snapshot_id (FK), match_date, round, home_team, away_team, exp_fh_goals, confidence, is_hot, venue rates, extras, verdicts", "Unique on (snapshot_id, home_team, away_team); re-save updates existing row and refreshes updated_at"],
  ],
  [16, 26, 34, 24]
));
bodyChildren.push(body([
  "Free-text fields that are lists today - the verdict badges - are stored as JSON arrays rather than being flattened into booleans, so new badge types can be added without migrations. Numeric columns keep two decimals exactly as the panel renders them; no rounding interpretation happens in the database layer.",
]));
bodyChildren.push(h2("4.4 Alternatives considered"));
bodyChildren.push(tableTitle("Table 2: Persistence options assessed"));
bodyChildren.push(makeTable(
  ["Option", "Strengths", "Limitations", "Verdict"],
  [
    ["Keep localStorage + CSV export", "Zero work; already exists", "Device-bound; no query capability; no audit trail", "Status quo - does not meet the goal"],
    ["Manual CSV export + import into Neon", "No app changes at all; the existing CSV already has an Expected FH Goals section with the panel numbers", "Depends on downloading and importing every matchday by hand; thin provenance; duplicate-prone", "Zero-touch fallback if the button is rejected"],
    ["Neon PostgreSQL via a Vercel function", "Plain SQL; one-way write path; serverless fit; branching for safe changes; user preference", "One more external service to keep alive; one small button in the app", "Recommended"],
    ["Supabase or Firebase", "Comparable free tiers; extra features (auth, realtime) unused here", "Heavier than needed; user asked for Neon; SQL analysis weaker on Firebase", "Viable fallback, not chosen"],
    ["Vercel Postgres (marketplace)", "Single-vendor billing", "It is resold Neon in most regions - verify before paying twice", "Check during Phase 0; prefer direct Neon"],
  ],
  [22, 28, 30, 20]
));
bodyChildren.push(h2("4.5 Versioning and future-proofing"));
bodyChildren.push(body([
  "The soccerstats en-gb redesign in November 2026 showed that upstream layout changes can shift what a parsed row means; the fix at the time involved rejecting ambiguous headings and bounding each heading to its own table. The persistence design inherits that lesson: every snapshot stores the parser version and the source URL, and the raw paste text can optionally be retained on the snapshot row. If parsing semantics ever change again, historical rows can be re-examined or re-derived against the original text instead of being silently reinterpreted. Column additions are handled by a simple rule: new insight fields become new nullable columns, and old rows simply read as null.",
]));

// ---- 5. Implementation Roadmap and Milestones ----
bodyChildren.push(h1("5. Implementation Roadmap and Milestones"));
bodyChildren.push(body([
  "The roadmap is phased so that each phase ends in something demonstrably working and testable, following the repo convention that every feature ships with assertions. Only Phase 1 touches the app; everything after it happens on the Neon side. Effort figures are honest estimates for the current maintainer, not commitments.",
]));
bodyChildren.push(tableTitle("Table 3: Phases, deliverables and verification"));
bodyChildren.push(makeTable(
  ["Phase", "Work items", "Deliverable and verification", "Rough effort"],
  [
    ["0 - Provision", "Create Neon account, project and main branch; create a dev branch; note the pooled connection string; confirm free-plan limits against projected volume", "DATABASE_URL recorded in Vercel env vars (never committed); limits documented in the repo notes", "About 30 minutes"],
    ["1 - Save path", "Create the two-table schema on a dev branch; add the write-only endpoint; add the Save action to the panel with confirmation and dedup behaviour; promote schema to main", "A saved matchup appears complete in the Neon SQL editor; re-saving updates rather than duplicates (asserted in the repo test suite)", "One evening"],
    ["2 - Analysis setup", "Neon side only: save a few recurring SQL queries (matchup quality per league and confidence grade); add the actual-results column for after the games; download CSV when a spreadsheet is preferred", "The prediction-versus-outcome question is answerable in one query after each matchday, with no app involvement", "Under an hour, once"],
  ],
  [14, 34, 34, 18]
));
bodyChildren.push(body([
  "Phase 1 is the commit gate: if the save path works and dedup is proven, everything after it is analysis, not engineering. If Phase 0 reveals that free-plan limits are tighter than expected, the fallback is the same design on a paid plan or on the Vercel marketplace equivalent, at negligible projected cost - the volume is hundreds of rows per month, not millions.",
]));

// ---- 6. Resource Requirements ----
bodyChildren.push(h1("6. Resource Requirements"));
bodyChildren.push(tableTitle("Table 4: What is needed"));
bodyChildren.push(makeTable(
  ["Item", "Requirement", "Notes"],
  [
    ["Neon account", "Free plan to start; one project, main + dev branches", "Verify current plan limits (storage, compute hours) in Phase 0; projected volume is a few hundred small rows per month"],
    ["Vercel project", "Existing deployment; one new write-only serverless function; one new environment variable (DATABASE_URL)", "No plan change expected at this request volume"],
    ["Application code", "One Save action in index.html; payload assembly from existing state objects", "No new client-side dependencies; no read path anywhere"],
    ["Function dependencies", "The Neon serverless driver package in the function bundle", "Single small dependency, server-side only"],
    ["Maintenance", "None scheduled; schema additions only when new insight fields appear", "Parser version column keeps history self-describing"],
  ],
  [20, 40, 40]
));
bodyChildren.push(body([
  "No budget line is proposed at this stage, on the stated assumption that the free plan covers the workload; if verification in Phase 0 shows otherwise, the decision returns to the user before any spend. No personal data is stored: the rows contain team names, league names, statistics and user-chosen notes only.",
]));

// ---- 7. Risk Analysis and Mitigation ----
bodyChildren.push(h1("7. Risk Analysis and Mitigation"));
bodyChildren.push(tableTitle("Table 5: Principal risks and mitigations"));
bodyChildren.push(makeTable(
  ["Risk", "Likelihood", "Impact", "Mitigation"],
  [
    ["Free-plan limits (storage or compute) are tighter than expected", "Low", "Low - volume is tiny", "Verify documented limits in Phase 0 before building; upgrade or switch provider is a config change, not a rewrite"],
    ["Cold starts on scale-to-zero make saves feel slow", "Medium", "Cosmetic", "Use the Neon pooled endpoint and the HTTP-based driver; accept sub-second to low-second latency; measure in Phase 1"],
    ["Upstream site redesign changes row meaning again", "Medium", "Medium - trust in archive", "Parser version and source URL on every snapshot; optional raw-text retention; nullable additive columns"],
    ["Duplicate or accidental saves pollute the archive", "Medium", "Low", "Unique constraint with upsert semantics; explicit user-triggered saves only; confirmation feedback in the UI"],
    ["Credential exposure", "Low", "High", "DATABASE_URL only in Vercel env vars; endpoints same-origin; no client-side secrets; no public CORS"],
    ["Vendor lock-in", "Low", "Low", "Plain PostgreSQL schema; portable to any Postgres provider; export stays possible via SQL"],
  ],
  [28, 14, 16, 42]
));

// ---- 8. Expected Benefits and Evaluation ----
bodyChildren.push(h1("8. Expected Benefits and Evaluation"));
bodyChildren.push(body([
  "The direct benefit is that pre-match numbers stop evaporating and start accumulating into an analysis dataset that belongs to the user - queryable with ordinary SQL from anywhere, without the app ever having to know the archive exists. Once the games are played, the questions that matter become queries instead of memories of a browser session: did HIGH-confidence matchups actually produce more first-half goals than MEDIUM ones, which leagues run hot against their expected values, how large were the misses. Because every row stores the pre-match state and its provenance, later edits to results columns cannot rewrite what was originally expected, so the comparisons stay honest.",
]));
bodyChildren.push(body([
  "Evaluation is concrete. The save path succeeds when a saved panel state appears complete in the Neon console and a deliberate re-save does not create a second row. The archive itself succeeds after the first matchday it covers: the expected numbers for those fixtures are present, correct and traceable to their source, and the post-match comparison can be run without touching the app at all. Ongoing health is monitored by two cheap checks: row counts per snapshot remain equal to what the UI reported saving, and every row carries a non-null parser version. If either check fails, the failure is visible immediately rather than discoverable months later during analysis.",
]));
bodyChildren.push(body([
  { text: "Decision requested: ", bold: true },
  "approval to proceed with Phase 0 (Neon provisioning and limit verification) and Phase 1 (schema and save path) as described, on the stated assumption that the free plan is sufficient, with any spend decision returning to the user first.",
]));

// ---- 9. Appendix ----
bodyChildren.push(h1("9. Appendix A: Field Dictionary for Saved Matchups"));
bodyChildren.push(body([
  "The dictionary below maps every element the FH Selected Matchup panel currently renders (as implemented in the renderFHSelectedMatch, expectedFHGoals and fhInsightFor functions of index.html) to its proposed database column. It is the contract between the panel and the fh_matchups table; adding a panel element means adding a nullable column and a row here.",
]));
bodyChildren.push(tableTitle("Table 6: Panel element to database column mapping"));
bodyChildren.push(makeTable(
  ["Panel element", "Source in the app", "Suggested column", "Type and notes"],
  [
    ["Home team / Away team", "Panel dropdowns", "home_team, away_team", "Text; matched case-insensitively to the FH table"],
    ["Fixture date, round, league", "Fixture lookup against loaded fixtures", "match_date, round, league", "Date and text; null when the pairing is custom"],
    ["Expected FH goals", "Average of host and visitor venue rates", "exp_fh_goals", "Numeric(4,2), two decimals as rendered"],
    ["Confidence badge", "HIGH when both venue tables present, MEDIUM when one, LOW when neither", "confidence", "Text; constrained to the three values"],
    ["FH MATCH badge", "exp_fh_goals at or above 1.5", "is_hot", "Boolean; drives the Over 0.5 FH lean"],
    ["Host venue rate, source, GP", "Home table value, or overall fallback; with its GP", "home_fh_gpm, home_rate_source, home_venue_gp", "Numeric and text; source records which table supplied it"],
    ["Visitor venue rate, source, GP", "Away table value, or overall fallback; with its GP", "away_fh_gpm, away_rate_source, away_venue_gp", "Symmetric with the host fields"],
    ["Overall FH goals per match", "Overall table row for each team", "home_overall_gpm, away_overall_gpm", "Numeric(4,2)"],
    ["FH HOT badges", "Entertaining flag per team", "home_entertaining, away_entertaining", "Boolean each"],
    ["1H share of goals; 2H venue rate", "Half-time insight from the same-page 2H tables", "home_1h_share_pct, home_2h_gpm (and away_*)", "Percentage and numeric; null when 2H tables absent"],
    ["HT draws / led / trailed", "Record when leading and trailing at half-time tables", "home_ht_draw_pct, home_ht_lead_pct, home_ht_trail_pct (and away_*)", "Percentages; null when extras absent"],
    ["Scoreless HT, 2+ by HT, HT clean sheets", "Scored and conceded distribution table", "home_ht_scoreless_pct, home_ht_2plus_pct, home_ht_cs_pct (and away_*)", "Percentages; null when extras absent"],
    ["Verdict badges", "Derived rules (fast starter, second-half team, HT draw angle, above league pace)", "verdicts", "JSON array of badge strings; extensible without migration"],
    ["League FH baseline", "League-wide first-half average of the loaded tables", "league_fh_baseline", "Numeric; null when baselines unavailable"],
    ["Provenance", "Soccerstats URL or manual paste, league name, processed timestamp", "snapshot_id (FK) with source_url, source_type, processed_at", "On the snapshot header; every matchup inherits it"],
    ["Parser identity", "Version marker of the table parser", "parser_version", "Text; set at Process FH Table time"],
  ],
  [22, 28, 26, 24]
));
bodyChildren.push(body([
  "Columns marked as nullable are populated only when the corresponding tables were loaded at save time; the confidence grade already tells future readers which venue inputs were present, and the snapshot tells them which extras were available. No column in this design stores anything about the user beyond the choices they explicitly saved.",
]));

// ============================= DOCUMENT =============================
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: { ascii: "Times New Roman" } })],
    })],
  });
}
function docHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 0 },
      children: [new TextRun({ text: "Techmari V2 - FH Matchup Persistence Proposal", size: 18, color: "808080", font: { ascii: "Times New Roman" } })],
    })],
  });
}

const doc = new Document({
  creator: "Techmari V2",
  title: "Persisting FH Matchup Data to Neon Postgres",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "Times New Roman" }, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 32, bold: true, color: P.ink },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 28, bold: true, color: P.ink },
        paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  numbering: {
    config: [{
      reference: "list-goals",
      levels: [{
        level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [
    // Section 1: Cover - margin 0, no footer/header, no pageNumbers
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Persisting FH Matchup Data to Neon Postgres",
        subtitle: "A persistence proposal for the Techmari V2 First-Half Insight module",
        englishLabel: "TECHMARI V2 PROPOSAL",
        metaLines: [
          "Module: FH Selected Matchup - Expected First-Half Goals",
          "Target: Neon serverless PostgreSQL (free plan)",
          "Prepared: 19 November 2026",
          "Status: Draft for review",
        ],
        footerLeft: "Techmari V2 - FH Insight",
        footerRight: "November 2026",
        palette: { bg: P.bg, accent: P.accent, ...P.cover },
      }),
    },
    // Section 2: Front matter (TOC) - Roman numerals
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: P.ink, font: { ascii: "Times New Roman", eastAsia: "SimHei" } })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
            italics: true, size: 18, color: "888888", font: { ascii: "Times New Roman" },
          })],
        }),
        // No trailing PageBreak here: the body lives in its own NEXT_PAGE section,
        // so a PageBreak would create a double break and a blank page (postcheck rule).
      ],
    },
    // Section 3: Body - Arabic numerals from 1
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE " + OUT + " (" + buf.length + " bytes)");
});
