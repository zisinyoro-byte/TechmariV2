// Syntax-check the <script> block of index.html + functional test of parseOpenFootballJSON
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

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
const sandbox = {
  console,
  document: {
    getElementById: () => ({ style: {}, innerText: '', innerHTML: '', classList: { remove() {}, add() {} } }),
    querySelector: () => ({ innerHTML: '', style: {} }),
    createElement: () => ({ setAttribute() {}, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  },
  fetch: null,
  alert: () => {},
  setTimeout
};
sandbox.globalMatches = [];
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
const ofMapStart = js.indexOf('const OPENFOOTBALL_LEAGUES');
const ofMapEnd = js.indexOf('};', ofMapStart) + 2;

const code = `
${js.slice(leagStart, leagEnd)}
${js.slice(ofMapStart, ofMapEnd)}
${extract('formatSeasonLabel')}
${extract('parseDateForSort')}
${extract('formatISODateToUK')}
${extract('formatOpenFootballSeason')}
${extract('parseOpenFootballJSON')}
function renderTable(){ }
`;
const ctx = vm.createContext(sandbox);
vm.runInContext(code, ctx);
vm.runInContext('var statusArea = { innerText: "", style: {} };', ctx);

// season format check
const s1 = vm.runInContext(`formatOpenFootballSeason('2526') + ' | ' + formatOpenFootballSeason('0910')`, ctx);
console.log('[Map] 2526 ->', s1.split(' | ')[0], '(expect 2025-25? no — expect 2025-26);  0910 ->', s1.split(' | ')[1], '(expect 2009-10, which will 404 gracefully)');
const iso1 = vm.runInContext(`formatISODateToUK('2025-08-15')`, ctx);
console.log('[Map] ISO 2025-08-15 ->', iso1, iso1 === '15/08/2025' ? 'PASS' : 'FAIL');

// --- Test 1: single season 2025-26 (in progress) ---
const en1_2526 = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_en1.json'), 'utf8');
const totalRows = JSON.parse(en1_2526).matches.length;
const r1 = vm.runInContext(
  `parseOpenFootballJSON(${JSON.stringify(en1_2526)}, 'E0', '2526', statusArea, {}, {}, {}, false)`, ctx
);
const matches = vm.runInContext('globalMatches', ctx);
console.log(`\n[Test 1] 2025-26 EPL: completed matches parsed=${r1} of ${totalRows} file rows (rest = upcoming fixtures, correctly skipped)`);
const first = matches[0], last = matches[matches.length - 1];
console.log('  first:', first.date, first.homeTeam, `${first.homeScore}-${first.awayScore}`, 'ftr=' + first.ftr, '| round:', first.round);
console.log('  last :', last.date, last.homeTeam, `${last.homeScore}-${last.awayScore}`, 'ftr=' + last.ftr);

const dateRe = /^\d{2}\/\d{2}\/\d{4}$/;
const key = d => { const [dd, mm, yy] = d.split('/').map(Number); return yy * 10000 + mm * 100 + dd; };
const badDate = matches.filter(x => !dateRe.test(x.date)).length;
const badFtr = matches.filter(x => !['H', 'D', 'A'].includes(x.ftr)).length;
const badScore = matches.filter(x => !Number.isInteger(x.homeScore) || !Number.isInteger(x.awayScore) || x.homeScore < 0 || x.awayScore < 0).length;
const ftrMismatch = matches.filter(x => (x.homeScore > x.awayScore) !== (x.ftr === 'H')).length;
const sorted = matches.every((x, i) => i === 0 || key(matches[i - 1].date) <= key(x.date));
console.log(`  bad dates: ${badDate} | bad ftr: ${badFtr} | bad scores: ${badScore} | ftr-vs-score mismatch: ${ftrMismatch} | date-sorted: ${sorted}`);
const t1ok = badDate === 0 && badFtr === 0 && badScore === 0 && ftrMismatch === 0 && sorted && r1 > 0;
console.log(t1ok ? '  PASS: single-season parse invariants hold' : '  FAIL: invariants violated');

// --- Test 2: multi-season append (2024-25 + 2025-26) ---
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => res(r.statusCode === 200 ? b : null));
    }).on('error', rej);
  });
}

(async () => {
  const j2425 = await get('https://raw.githubusercontent.com/openfootball/football.json/master/2024-25/en.1.json');
  if (!j2425) { console.log('\n[Test 2] SKIP: network unavailable'); return finish(); }

  vm.runInContext('globalMatches = []; matchOddsData = {};', ctx);
  vm.runInContext(`parseOpenFootballJSON(${JSON.stringify(j2425)}, 'E0', '2425', statusArea, {}, {}, {}, true)`, ctx);
  vm.runInContext(`parseOpenFootballJSON(${JSON.stringify(en1_2526)}, 'E0', '2526', statusArea, {}, {}, {}, true)`, ctx);
  const multi = vm.runInContext('globalMatches', ctx);
  const completed2425 = JSON.parse(j2425).matches.filter(x => x.score && x.score.ft && typeof x.score.ft[0] === 'number').length;
  const expected = completed2425 + r1;
  const labels = [...new Set(multi.map(x => x.league))];
  const chrono = multi.every((x, i) => i === 0 || key(multi[i - 1].date) <= key(x.date));
  console.log(`\n[Test 2] multi-season: total=${multi.length} (expected ${completed2425}+${r1}=${expected}) | labels: ${labels.join(' | ')}`);
  console.log('  chronological across seasons:', chrono);
  console.log(multi.length === expected && labels.length === 2 && chrono ? '  PASS: multi-season append OK' : '  FAIL: multi-season append wrong');

  // --- Test 3: graceful failure ---
  const r3 = vm.runInContext(`parseOpenFootballJSON('not json at all', 'E0', '2526', statusArea, {}, {}, {}, false)`, ctx);
  console.log(`\n[Test 3] invalid JSON -> ${r3} (expect 0):`, r3 === 0 ? 'PASS' : 'FAIL');
  const r4 = vm.runInContext(`parseOpenFootballJSON('{"matches": []}', 'E0', '2526', statusArea, {}, {}, {}, false)`, ctx);
  console.log('[Test 3b] empty matches -> ' + r4 + ' (expect 0):', r4 === 0 ? 'PASS' : 'FAIL');
  const r5 = vm.runInContext(`parseOpenFootballJSON('{"matches":[{"round":"MD1","date":"2025-08-15","team1":"A","team2":"B"}]}', 'E0', '2526', statusArea, {}, {}, {}, false)`, ctx);
  console.log('[Test 3c] fixture-without-score skipped -> ' + r5 + ' (expect 0):', r5 === 0 ? 'PASS' : 'FAIL');

  finish();
})().catch(e => { console.error('Harness error:', e); finish(); });

function finish() { console.log('\nAll done.'); }
