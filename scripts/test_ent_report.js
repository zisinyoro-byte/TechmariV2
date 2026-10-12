// Syntax-check + functional test: OpenFootball fixture capture & Entertaining Teams report
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: script block not found'); process.exit(1); }
const js = m[1];

// 1) Syntax check
try {
  new Function(js);
  console.log('PASS: script block parses (syntax OK)');
} catch (e) {
  console.error('FAIL: syntax error ->', e.message);
  process.exit(1);
}

// 2) Sandbox
const sandbox = {
  console,
  document: {
    getElementById: () => ({ style: {}, innerText: '', innerHTML: '', classList: { remove() {}, add() {} } }),
    querySelector: () => ({ innerHTML: '', style: {} }),
    createElement: () => ({ setAttribute() {}, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  },
  alert: () => {},
  setTimeout
};
sandbox.globalMatches = [];
sandbox.globalFixtures = [];
sandbox.matchOddsData = {};

function extract(name) {
  const start = js.indexOf(`function ${name}(`);
  if (start === -1) throw new Error('function not found: ' + name);
  let i = js.indexOf('{', start), depth = 0, end = -1;
  for (; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return js.slice(start, end);
}

const leagStart = js.indexOf('const LEAGUE_NAMES');
const leagEnd = js.indexOf('};', leagStart) + 2;

const code = `
${js.slice(leagStart, leagEnd)}
${extract('formatSeasonLabel')}
${extract('formatISODateToUK')}
${extract('parseDateForSort')}
${extract('sortMatchesByDate')}
${extract('parseOpenFootballJSON')}
${extract('todayUK')}
${extract('getUpcomingEntertainerFixtures')}
${extract('csvEscape')}
${extract('buildEntertainingReportCSV')}
${extract('calculateCleanSheetStats')}
function renderTable(){ }
`;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
vm.runInContext('var statusArea = { innerText: "", style: {} };', sandbox);

let failed = 0;
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${cond ? '' : ' -> ' + (detail || '')}`);
  if (!cond) failed++;
}

// --- Test 1: OpenFootball fixture capture (sample 2025-26 EPL) ---
const sample = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_en1.json'), 'utf8');
const rows = JSON.parse(sample).matches;
const completedExpected = rows.filter(x => x.score && x.score.ft && typeof x.score.ft[0] === 'number' && typeof x.score.ft[1] === 'number').length;
const fixturesExpected = rows.length - completedExpected;
const parsed = vm.runInContext(`parseOpenFootballJSON(${JSON.stringify(sample)}, 'E0', '2526', statusArea, {}, {}, {}, false)`, sandbox);
const fx = vm.runInContext('globalFixtures', sandbox);
check(`matches parsed = ${completedExpected} (unchanged regression)`, parsed === completedExpected, `got ${parsed}`);
check(`fixtures captured = ${fixturesExpected} (was: discarded)`, fx.length === fixturesExpected, `got ${fx.length}`);
check('fixtures have no scores + have teams/date/round', fx.every(f => f.homeScore === undefined && f.homeTeam && f.awayTeam && /^\d{2}\/\d{2}\/\d{4}$/.test(f.date)), JSON.stringify(fx[0]));
const key = d => { const [dd, mm, yy] = d.split('/').map(Number); return yy * 10000 + mm * 100 + dd; };
check('fixtures sorted by date', fx.every((f, i) => i === 0 || key(fx[i - 1].date) <= key(f.date)));

// --- Test 2: upcoming filter + both-entertainer flag ---
const teams = [{ team: 'Team A' }, { team: 'Team B' }];
const synthFixtures = [
  { date: '20/09/2026', homeTeam: 'Team A', awayTeam: 'Team X', round: 'R1' },  // past -> excluded
  { date: '18/10/2026', homeTeam: 'Team X', awayTeam: 'Team A', round: 'R2' },  // future, one entertainer (away)
  { date: '19/10/2026', homeTeam: 'Team A', awayTeam: 'Team B', round: 'R2' },  // future, BOTH
  { date: '25/10/2026', homeTeam: 'Team X', awayTeam: 'Team B', round: 'R3' },  // future, one entertainer
  { date: '15/10/2026', homeTeam: 'Team Y', awayTeam: 'Team Z', round: 'R2' }   // no entertainer -> excluded
];
vm.runInContext(`globalFixtures = ${JSON.stringify(synthFixtures)}`, sandbox);
const up = vm.runInContext(`getUpcomingEntertainerFixtures([{team:'Team A'},{team:'Team B'}], globalFixtures, '01/10/2026')`, sandbox);
check('upcoming count = 3 (past + non-entertainer excluded)', up.length === 3, `got ${up.length}`);
check('sorted chronologically', up.map(f => f.date).join('|') === '18/10/2026|19/10/2026|25/10/2026', up.map(f => f.date).join('|'));
check('both-entertainer flag only on A vs B', up[0].bothEntertaining === false && up[1].bothEntertaining === true && up[2].bothEntertaining === false);
check('empty teams -> []', vm.runInContext(`getUpcomingEntertainerFixtures([], globalFixtures, '01/10/2026')`, sandbox).length === 0);
check('empty fixtures -> []', vm.runInContext(`getUpcomingEntertainerFixtures([{team:'Team A'}], [], '01/10/2026')`, sandbox).length === 0);

// --- Test 3: CSV report builder ---
const csv = vm.runInContext(`buildEntertainingReportCSV([
  { team: 'Team A', attack: 1.52, defense: 1.31, rawAttack: 1.40, rawDefense: 1.25, avgScored: 2.1, avgConceded: 1.7, totalGames: 8, combinedScore: 2.83 },
  { team: 'Team B', attack: 1.40, defense: 1.20, rawAttack: 1.35, rawDefense: 1.10, avgScored: 1.9, avgConceded: 1.5, totalGames: 8, combinedScore: 2.60 },
  { team: 'Team "C"', attack: 1.30, defense: 1.10, rawAttack: 1.25, rawDefense: 1.05, avgScored: 1.7, avgConceded: 1.4, totalGames: 6, combinedScore: 2.40 }
], ${JSON.stringify(up)}, '13/10/2026, 09:00', '13/10/2026')`, sandbox);
check('has title + both sections', csv.includes('Entertaining Teams Report') && csv.includes('SECTION 1: ENTERTAINING TEAMS') && csv.includes('SECTION 2: UPCOMING FIXTURES'));
check('header has score column', csv.includes('Rank,Team,Entertainment Score'));
check('team row with score', csv.includes('"Team A","2.83"') && csv.includes('"1.52"'), csv.split('\n').slice(5, 8).join(' / '));
check('quote escaping (Team ""C"")', csv.includes('"Team ""C"""'));
check('clean sheet N/A when no match data', csv.includes('"N/A"'));
check('next fixture (A) for Team A', csv.includes('18/10/2026 (A) at Team X'));
check('next fixture (A) + both tag for Team B', csv.includes('19/10/2026 (A) at Team A [BOTH ENTERTAINING]'));
check('no-fixture team shows None found', csv.split('"Team ""C"""')[1].includes('None found'));
check('section 2 both-entertaining note', csv.includes('BOTH ENTERTAINING - Over 2.5 / BTTS candidate'));
check('section 2 single-entertainer notes', csv.includes('Entertainer: Team A') && csv.includes('Entertainer: Team B'));
check('CSV ends with newline', csv.endsWith('\n'));

// --- Test 4: empty upcoming -> explanatory note ---
const csv2 = vm.runInContext(`buildEntertainingReportCSV([{ team: 'Team A', attack: 1.5, defense: 1.2, rawAttack: 1.4, rawDefense: 1.1, avgScored: 2, avgConceded: 1.5, totalGames: 6, combinedScore: 2.7 }], [], '13/10/2026', '13/10/2026')`, sandbox);
check('empty fixtures -> note line present', csv2.includes('None found. NOTE: upcoming fixtures are only captured'));

console.log(failed === 0 ? '\nALL TESTS PASS' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
