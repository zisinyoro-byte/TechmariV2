// Syntax-check the <script> block of index.html + functional test of clean sheet feature
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

// 2) Functional test: extract the functions we need and run them in a sandbox
const elements = new Map();
function getEl(id) {
  if (!elements.has(id)) {
    elements.set(id, { innerText: '', innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {} } });
  }
  return elements.get(id);
}

const sandbox = {
  console,
  document: {
    getElementById: (id) => getEl(id),
    querySelector: () => ({ innerHTML: '', style: {} }),
    createElement: () => ({ setAttribute() {}, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  },
  alert: () => {},
  setTimeout
};
sandbox.globalMatches = [];
sandbox.teamStats = {};

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

const code = `
${extract('parseDateForSort')}
${extract('sortMatchesByDate')}
${extract('getSpecificTeamStats')}
${extract('calculateCleanSheetStats')}
${extract('formatCleanSheetValue')}
${extract('updateCleanSheetDisplay')}
${extract('calculateSpecificTeamInsights')}
${extract('onTeamSelectChange')}
`;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} -> got "${actual}"${ok ? '' : `, expected "${expected}"`}`);
  if (!ok) failed++;
}

// --- Test data: Arsenal, 10 played matches (5 home, 5 away) in chronological order ---
// Home CS: 4/5 (matches 1,3,7,9), Away CS: 2/5 (matches 6,10) -> overall 6/10 = 60%
// Trailing streak: matches 9 (4-0) and 10 (0-0) clean -> streak = 2
const played = [
  { date: '10/08/2024', homeTeam: 'Arsenal', awayTeam: 'Brentford', homeScore: 2, awayScore: 0 }, // CS (H)
  { date: '17/08/2024', homeTeam: 'Chelsea', awayTeam: 'Arsenal', homeScore: 1, awayScore: 1 },
  { date: '24/08/2024', homeTeam: 'Arsenal', awayTeam: 'Dover',     homeScore: 0, awayScore: 0 }, // CS (H)
  { date: '31/08/2024', homeTeam: 'Brentford', awayTeam: 'Arsenal', homeScore: 3, awayScore: 1 },
  { date: '07/09/2024', homeTeam: 'Arsenal', awayTeam: 'Chelsea',   homeScore: 2, awayScore: 1 },
  { date: '14/09/2024', homeTeam: 'Dover',     awayTeam: 'Arsenal', homeScore: 0, awayScore: 2 }, // CS (A)
  { date: '21/09/2024', homeTeam: 'Arsenal', awayTeam: 'Brentford', homeScore: 1, awayScore: 0 }, // CS (H)
  { date: '28/09/2024', homeTeam: 'Chelsea', awayTeam: 'Arsenal', homeScore: 2, awayScore: 3 },
  { date: '05/10/2024', homeTeam: 'Arsenal', awayTeam: 'Dover',     homeScore: 4, awayScore: 0 }, // CS (H)
  { date: '12/10/2024', homeTeam: 'Brentford', awayTeam: 'Arsenal', homeScore: 0, awayScore: 0 }  // CS (A)
];
// Upcoming fixture WITHOUT scores (legacy paste scenario) — must be excluded, must NOT break streak
const upcoming = { date: '19/10/2024', homeTeam: 'Arsenal', awayTeam: 'Chelsea', homeScore: NaN, awayScore: NaN };

// Feed matches SHUFFLED to prove date-sorting works for streak logic
sandbox.globalMatches = [upcoming, played[5], played[0], played[9], played[2], played[7], played[3], played[8], played[1], played[6], played[4]];

const r = vm.runInContext('calculateCleanSheetStats("Arsenal")', sandbox);
check('Arsenal overall CS%', r ? r.pct.toFixed(1) : 'null', '60.0');
check('Arsenal CS fraction', r ? `${r.cs}/${r.total}` : '-', '6/10');
check('Arsenal home CS%', r ? r.homePct.toFixed(1) : 'null', '80.0');
check('Arsenal home CS fraction', r ? `${r.homeCS}/${r.homeTotal}` : '-', '4/5');
check('Arsenal away CS%', r ? r.awayPct.toFixed(1) : 'null', '40.0');
check('Arsenal away CS fraction', r ? `${r.awayCS}/${r.awayTotal}` : '-', '2/5');
check('Arsenal CS streak (NaN fixture excluded)', String(r ? r.streak : '-'), '2');

// Unknown team -> null
check('Unknown team returns null', String(vm.runInContext('calculateCleanSheetStats("Nowhere Utd")', sandbox)), 'null');

// formatCleanSheetValue
check('format value', vm.runInContext('formatCleanSheetValue(60.04, 6, 10)', sandbox), '60.0% (6/10)');
check('format null -> dash', vm.runInContext('formatCleanSheetValue(null, 0, 0)', sandbox), '-');

// Display integration: live update via onTeamSelectChange (no Predict click)
sandbox.teamStats = { Arsenal: {}, Chelsea: {}, Dover: {}, Brentford: {} }; // non-empty so the guard passes (as after data load)
getEl('homeTeamSelect').value = 'Arsenal';
getEl('awayTeamSelect').value = 'Brentford'; // Brentford has matches too (played vs Arsenal only)
vm.runInContext('onTeamSelectChange()', sandbox);
check('display: Arsenal overall', getEl('homeCleanSheetPct').innerText, '60.0% (6/10)');
check('display: Arsenal at home', getEl('homeCleanSheetHomePct').innerText, '80.0% (4/5)');
check('display: Arsenal away', getEl('homeCleanSheetAwayPct').innerText, '40.0% (2/5)');
check('display: Arsenal streak', getEl('homeCleanSheetStreak').innerText, '2 matches');
// Brentford: 4 matches vs Arsenal. CS = conceded 0? m1 (0-2, conceded 2: no), m4 (won 3-1: no), m7 (0-1, conceded 1: no), m10 (0-0 at home: CS) -> 1 CS /4 = 25%
check('display: Brentford overall', getEl('awayCleanSheetPct').innerText, '25.0% (1/4)');
check('display: Brentford streak', getEl('awayCleanSheetStreak').innerText, '1 match');

// Empty teamStats guard: no throw, no updates
sandbox.teamStats = {};
elements.get('homeCleanSheetPct').innerText = 'SENTINEL';
vm.runInContext('onTeamSelectChange()', sandbox);
check('guard: no update when teamStats empty', getEl('homeCleanSheetPct').innerText, 'SENTINEL');

// Team with no matches renders dashes
sandbox.teamStats = { Ghost: {} };
getEl('homeTeamSelect').value = 'Ghost';
getEl('awayTeamSelect').value = 'Arsenal';
vm.runInContext('onTeamSelectChange()', sandbox);
check('display: no-data team -> dash', getEl('homeCleanSheetPct').innerText, '-');

console.log(failed === 0 ? '\nALL TESTS PASS' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
