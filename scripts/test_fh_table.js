// Syntax-check + functional test: First Half (FH) entertaining teams — pasted standings table
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

// 2) User's exact sample (tab-separated, as pasted from the site)
const SAMPLE = [
  'First Half table (1-45 min.)',
  'GP\tW\tD\tL\tGF\tGA\tGD\tPts',
  '1\tHeracles Almelo\t14\t10\t3\t1\t23\t6\t+17\t33',
  '2\tFC Volendam\t14\t8\t3\t3\t15\t8\t+7\t27',
  '3\tVVV-Venlo\t14\t8\t1\t5\t17\t13\t+4\t25',
  '4\tNAC Breda\t14\t7\t4\t3\t12\t8\t+4\t25',
  '5\tAlmere City\t14\t5\t8\t1\t9\t5\t+4\t23',
  '6\tFC Den Bosch\t13\t6\t4\t3\t11\t7\t+4\t22',
  '7\tJong Ajax\t14\t5\t5\t4\t12\t12\t0\t20',
  '8\tRoda JC Kerkrade\t14\t4\t6\t4\t7\t8\t-1\t18',
  '9\tJong AZ\t14\t4\t5\t5\t13\t13\t0\t17',
  '10\tFC Emmen\t13\t4\t5\t4\t10\t10\t0\t17',
  '11\tJong PSV\t14\t3\t8\t3\t9\t9\t0\t17',
  '12\tTOP Oss\t14\t5\t2\t7\t9\t12\t-3\t17',
  '13\tJong FC Utrecht\t13\t4\t4\t5\t14\t17\t-3\t16',
  '14\tVitesse\t13\t3\t5\t5\t8\t9\t-1\t14',
  '15\tRKC Waalwijk\t14\t4\t2\t8\t7\t9\t-2\t14',
  '16\tFC Eindhoven\t14\t3\t5\t6\t8\t12\t-4\t14',
  '17\tFC Dordrecht\t14\t3\t4\t7\t10\t20\t-10\t13',
  '18\tMVV Maastricht\t13\t2\t6\t5\t6\t12\t-6\t12',
  '19\tHelmond Sport\t14\t2\t5\t7\t12\t17\t-5\t11',
  '20\tDe Graafschap\t13\t2\t5\t6\t9\t14\t-5\t11'
].join('\n');

// 3) Sandbox
const els = {
  fhRawInput: { value: '' },
  fhLeagueInput: { value: '' },
  fhTableStatus: { innerText: '', style: {} },
  fhTableContent: { innerHTML: '' },
  fhExportBtn: { style: {} }
};
const sandbox = {
  console,
  alert: () => {},
  setTimeout,
  document: {
    getElementById: (id) => els[id] || { style: {}, innerText: '', innerHTML: '', classList: { add() {}, remove() {} } },
    querySelector: () => ({ innerHTML: '', style: {} }),
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  }
};
sandbox.globalMatches = [];
sandbox.globalFixtures = [];

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
const aliasStart = js.indexOf('const LEAGUE_TITLE_ALIASES');
const aliasEnd = js.indexOf('};', aliasStart) + 2;

const code = `
${js.slice(leagStart, leagEnd)}
${js.slice(aliasStart, aliasEnd)}
${extract('canonLeagueTitle')}
${extract('csvEscape')}
${extract('parseFHTableRow')}
${extract('detectFHLeagueTitle')}
${extract('rankFHTeams')}
${extract('processFHTable')}
${extract('renderFHTable')}
${extract('buildFHFileSlug')}
${extract('exportFHReportCSV')}
`;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
vm.runInContext('var fhTableTeams = []; var fhLeague = "";', sandbox);

let failed = 0;
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${cond ? '' : ' -> ' + (detail || '')}`);
  if (!cond) failed++;
}

// --- Test 1: row parser ---
check('header row -> HEADER', vm.runInContext(`parseFHTableRow('GP\tW\tD\tL\tGF\tGA\tGD\tPts')`, sandbox) === 'HEADER');
check('title line -> null', vm.runInContext(`parseFHTableRow('First Half table (1-45 min.)')`, sandbox) === null);
const her = JSON.parse(vm.runInContext(`JSON.stringify(parseFHTableRow('1\tHeracles Almelo\t14\t10\t3\t1\t23\t6\t+17\t33'))`, sandbox));
check('Heracles row parsed', her && her.team === 'Heracles Almelo' && her.pos === 1 && her.gp === 14 && her.gf === 23 && her.ga === 6 && her.gd === 17 && her.pts === 33, JSON.stringify(her));
const nopos = JSON.parse(vm.runInContext(`JSON.stringify(parseFHTableRow('Heracles Almelo\t14\t10\t3\t1\t23\t6\t+17\t33'))`, sandbox));
check('row without position column', nopos && nopos.pos === null && nopos.team === 'Heracles Almelo' && nopos.pts === 33, JSON.stringify(nopos));
const minimal = JSON.parse(vm.runInContext(`JSON.stringify(parseFHTableRow('Team X\t2\t1\t1\t0\t3\t1'))`, sandbox));
check('GD/Pts fallback (gd=2, pts=4)', minimal && minimal.gd === 2 && minimal.pts === 4, JSON.stringify(minimal));
check('too-short row -> null', vm.runInContext(`parseFHTableRow('FC Somewhere\t14\t10')`, sandbox) === null);
check('multi-space row parses', (() => {
  const r = JSON.parse(vm.runInContext(`JSON.stringify(parseFHTableRow('2  FC Volendam  14  8  3  3  15  8  +7  27'))`, sandbox));
  return r && r.team === 'FC Volendam' && r.gf === 15 && r.ga === 8;
})());

// --- Test 2: league title detection ---
check('detect: league line found', vm.runInContext(`detectFHLeagueTitle(['Netherlands Eerste Divisie', 'First Half table (1-45 min.)', 'GP\tW\tD\tL\tGF\tGA\tGD\tPts', '1\tTeam A\t2\t1\t1\t0\t3\t1\t+2\t4'])`, sandbox) === 'Netherlands Eerste Divisie');
check('detect: marker/header only -> ""', vm.runInContext(`detectFHLeagueTitle(['First Half table (1-45 min.)', 'GP\tW\tD\tL\tGF\tGA\tGD\tPts', '1\tTeam A\t2\t1\t1\t0\t3\t1\t+2\t4'])`, sandbox) === '');

// --- Test 3: ranking on the user's sample ---
vm.runInContext(`var SAMPLE_TEXT = ${JSON.stringify(SAMPLE)};`, sandbox);
const ranked2 = JSON.parse(vm.runInContext(`JSON.stringify(rankFHTeams(SAMPLE_TEXT.split('\\n').map(l => l.trim()).filter(l => l.length > 0).map(parseFHTableRow).filter(r => r && r !== 'HEADER')))`, sandbox));
check('20 teams parsed from sample', ranked2.length === 20, `got ${ranked2.length}`);
check('top ranked = Jong FC Utrecht (31/13 = 2.38)', ranked2[0].team === 'Jong FC Utrecht' && ranked2[0].goalsPerMatch.toFixed(2) === '2.38', ranked2[0].team + ' ' + ranked2[0].goalsPerMatch);
const herR = ranked2.find(t => t.team === 'Heracles Almelo');
check('Heracles 29/14 = 2.07', herR && herR.goalsPerMatch.toFixed(2) === '2.07', herR && herR.goalsPerMatch);
const entCount = ranked2.filter(t => t.entertaining).length;
check('11 entertaining at >= 1.5', entCount === 11, `got ${entCount}`);
check('TOP Oss boundary 1.5 -> YES', (ranked2.find(t => t.team === 'TOP Oss') || {}).entertaining === true);
check('Almere City 1.00 -> NO', (ranked2.find(t => t.team === 'Almere City') || {}).entertaining === false);
const ranksSorted = ranked2.every((t, i) => i === 0 || ranked2[i - 1].goalsPerMatch >= t.goalsPerMatch);
check('sorted by FH goals/match desc', ranksSorted);

// --- Test 4: full process flow with league input ---
els.fhRawInput.value = SAMPLE;
els.fhLeagueInput.value = 'Eerste Divisie';
vm.runInContext('processFHTable()', sandbox);
check('canon: Eerste Divisie -> Netherlands - Eerste Divisie', vm.runInContext(`canonLeagueTitle('Eerste Divisie')`, sandbox) === 'Netherlands - Eerste Divisie');
check('status: 20 teams + canonical league', els.fhTableStatus.innerText.includes('20 teams parsed') && els.fhTableStatus.innerText.includes('Netherlands - Eerste Divisie'), els.fhTableStatus.innerText);
check('table rendered with FH HOT badge', els.fhTableContent.innerHTML.includes('FH HOT') && els.fhTableContent.innerHTML.includes('Jong FC Utrecht'));
check('export button shown', els.fhExportBtn.style.display === 'inline-block');

// --- Test 5: CSV export (filename + content) ---
let linkAttrs = null;
sandbox.document.createElement = () => { const o = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, click() {}, style: {} }; linkAttrs = o; return o; };
const todayISO = new Date().toISOString().slice(0, 10);
vm.runInContext('exportFHReportCSV()', sandbox);
check('filename: league slug + date', linkAttrs && linkAttrs.attrs.download === `techmari_fh_entertaining_teams_Netherlands_Eerste_Divisie_${todayISO}.csv`, linkAttrs && linkAttrs.attrs.download);
const csvText = linkAttrs ? decodeURIComponent(linkAttrs.attrs.href) : '';
check('CSV has section title', csvText.includes('SECTION 1: FH ENTERTAINING TEAMS RANKING'));
check('CSV top row values correct', csvText.includes('"1","Jong FC Utrecht","13","14","17","-3","2.38","1.08","1.31","1.23","YES"'), csvText.split('\n').slice(5, 8).join(' / '));
check('CSV 11 YES rows', (csvText.match(/,"YES"/g) || []).length === 11, `got ${(csvText.match(/,"YES"/g) || []).length}`);
check('CSV note line present', csvText.includes('Note: ranking uses only the pasted table totals'));

// --- Test 6: no league info -> fallback name ---
els.fhLeagueInput.value = '';
els.fhRawInput.value = SAMPLE.split('\n').slice(1).join('\n');  // drop title line too
vm.runInContext('processFHTable()', sandbox);
check('fallback league -> First Half Table', vm.runInContext(`fhLeague`, sandbox) === 'First Half Table', vm.runInContext(`fhLeague`, sandbox));
linkAttrs = null;
vm.runInContext('exportFHReportCSV()', sandbox);
check('fallback filename slug', linkAttrs && linkAttrs.attrs.download === `techmari_fh_entertaining_teams_First_Half_Table_${todayISO}.csv`, linkAttrs && linkAttrs.attrs.download);

// --- Test 7: empty paste -> error status, no export ---
els.fhRawInput.value = '   ';
vm.runInContext('processFHTable()', sandbox);
check('empty paste -> prompt message', els.fhTableStatus.innerText.includes('Please paste a First Half table first'));

// --- Test 8: multi-space separated variant ---
els.fhRawInput.value = SAMPLE.replace(/\t/g, '  ');
els.fhLeagueInput.value = 'Eerste Divisie';
vm.runInContext('processFHTable()', sandbox);
check('multi-space variant -> 20 teams', els.fhTableStatus.innerText.includes('20 teams parsed'), els.fhTableStatus.innerText);

console.log(failed === 0 ? '\nALL TESTS PASS' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
