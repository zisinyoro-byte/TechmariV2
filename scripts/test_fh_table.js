// Syntax-check + functional test: First Half (FH) entertaining teams — pasted standings tables
// Covers: Overall / Home / Away table parsing, split derivation, venue profiles,
//         expected FH goals for upcoming fixtures, CSV sections, file naming.
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

// 2) User's exact overall sample (tab-separated, as pasted from the site)
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

// Venue splits for 6 teams — each Home+Away sums exactly to the Overall row above.
const HOME_TABLE = [
  'First Half home table',
  'GP\tW\tD\tL\tGF\tGA\tGD\tPts',
  '1\tHeracles Almelo\t7\t6\t1\t0\t15\t2\t+13\t19',
  '2\tFC Volendam\t7\t5\t2\t0\t9\t3\t+6\t17',
  '3\tVVV-Venlo\t7\t6\t0\t1\t11\t4\t+7\t18',
  '4\tNAC Breda\t7\t5\t2\t0\t8\t2\t+6\t17',
  '5\tAlmere City\t7\t3\t4\t0\t5\t2\t+3\t13',
  '6\tJong FC Utrecht\t6\t3\t2\t1\t7\t8\t-1\t11'
].join('\n');

const AWAY_TABLE = [
  'First Half away table',
  'GP\tW\tD\tL\tGF\tGA\tGD\tPts',
  '1\tHeracles Almelo\t7\t4\t2\t1\t8\t4\t+4\t14',
  '2\tFC Volendam\t7\t3\t1\t3\t6\t5\t+1\t10',
  '3\tVVV-Venlo\t7\t2\t1\t4\t6\t9\t-3\t7',
  '4\tNAC Breda\t7\t2\t2\t3\t4\t6\t-2\t8',
  '5\tAlmere City\t7\t2\t4\t1\t4\t3\t+1\t10',
  '6\tJong FC Utrecht\t7\t1\t2\t4\t7\t9\t-2\t5'
].join('\n');

// 3) Sandbox
const panelEl = { hidden: true };
const els = {
  fhRawInput: { value: '' },
  fhLeagueInput: { value: '' },
  fhTableStatus: { innerText: '', style: {} },
  fhTableContent: { innerHTML: '' },
  fhExportBtn: { style: {} },
  fhFixtureSelect: { value: '', innerHTML: '' },
  fhHomeSelect: { value: '', innerHTML: '' },
  fhAwaySelect: { value: '', innerHTML: '' },
  fhSelectedMatchCard: { innerHTML: '' },
  fhMatchupsPanel: { hidden: true, classList: { add: () => { panelEl.hidden = true; }, remove: () => { panelEl.hidden = false; } } },
  fhMatchupsContent: { innerHTML: '' }
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
${extract('parseDateForSort')}
${extract('sortMatchesByDate')}
${extract('todayUK')}
${extract('parseFHTableRow')}
${extract('detectFHLeagueTitle')}
${extract('fhGpm')}
${extract('sumFHSplit')}
${extract('diffFHSplit')}
${extract('detectFHVARIANT')}
${extract('extractLeagueFromFhTitle')}
${extract('parseFHPaste')}
${extract('rankFHTeams')}
${extract('processFHTable')}
${extract('renderFHTable')}
${extract('expectedFHGoals')}
${extract('getUpcomingFHMatchups')}
${extract('renderFHMatchups')}
${extract('escFh')}
${extract('fhUpcomingFixtures')}
${extract('refreshFHFixtureDropdowns')}
${extract('onFHFixtureSelect')}
${extract('onFHTeamSelect')}
${extract('findFHFixtureFor')}
${extract('renderFHSelectedMatch')}
${extract('clearFHData')}
${extract('buildFHFileSlug')}
${extract('exportFHReportCSV')}
`;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
vm.runInContext('var fhTableTeams = []; var fhLeague = ""; var fhTableData = { overall: [], home: [], away: [] }; var fhSplitSource = { overall: "none", home: "none", away: "none" }; var fhFixtureOptions = [];', sandbox);

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

// --- Test 2b: variant detection ---
check('variant: overall title', vm.runInContext(`detectFHVARIANT('First Half table (1-45 min.)')`, sandbox) === 'overall');
check('variant: home title', vm.runInContext(`detectFHVARIANT('First Half home table')`, sandbox) === 'home');
check('variant: away title', vm.runInContext(`detectFHVARIANT('First Half away table (1-45 min.)')`, sandbox) === 'away');
check('variant: second half -> skip', vm.runInContext(`detectFHVARIANT('Second Half table (46-90 min.)')`, sandbox) === 'second');
check('variant: data row -> null', vm.runInContext(`detectFHVARIANT('1\tHeracles Almelo\t14\t10\t3\t1\t23\t6\t+17\t33')`, sandbox) === null);
check('league embedded in FH title', vm.runInContext(`extractLeagueFromFhTitle('Eerste Divisie - First Half home table')`, sandbox) === 'Eerste Divisie');
check('no league embedded -> ""', vm.runInContext(`extractLeagueFromFhTitle('First Half table (1-45 min.)')`, sandbox) === '');

// --- Test 2c: parseFHPaste segmentation ---
const segs = JSON.parse(vm.runInContext(`JSON.stringify(parseFHPaste((${JSON.stringify(SAMPLE + '\n\n' + HOME_TABLE + '\n\n' + AWAY_TABLE)}).split('\\n').map(l => l.trim()).filter(l => l.length > 0)))`, sandbox));
check('paste split: 20 overall rows', segs.segs.overall.length === 20, `got ${segs.segs.overall.length}`);
check('paste split: 6 home rows', segs.segs.home.length === 6, `got ${segs.segs.home.length}`);
check('paste split: 6 away rows', segs.segs.away.length === 6, `got ${segs.segs.away.length}`);
const SH_PASTE = SAMPLE + '\n\nSecond Half table (46-90 min.)\nGP\tW\tD\tL\tGF\tGA\tGD\tPts\n1\tPhantom FC\t14\t5\t5\t4\t10\t10\t0\t20';
const segs2 = JSON.parse(vm.runInContext(`JSON.stringify(parseFHPaste((${JSON.stringify(SH_PASTE)}).split('\\n').map(l => l.trim()).filter(l => l.length > 0)))`, sandbox));
check('second-half rows skipped', segs2.segs.overall.length === 20 && segs2.segs.home.length === 0 && segs2.segs.away.length === 0, JSON.stringify({ o: segs2.segs.overall.length, h: segs2.segs.home.length, a: segs2.segs.away.length }));
const segs3 = JSON.parse(vm.runInContext(`JSON.stringify(parseFHPaste((${JSON.stringify(SAMPLE.split('\n').slice(1).join('\n'))}).split('\\n').map(l => l.trim()).filter(l => l.length > 0)))`, sandbox));
check('title-less paste defaults to overall', segs3.segs.overall.length === 20, `got ${segs3.segs.overall.length}`);

// --- Test 2d: split arithmetic helpers ---
const sums = JSON.parse(vm.runInContext(`JSON.stringify(sumFHSplit(parseFHTableRow('1\tTeam X\t7\t6\t1\t0\t15\t2\t+13\t19'), parseFHTableRow('1\tTeam X\t7\t4\t2\t1\t8\t4\t+4\t14')))`, sandbox));
check('sum split: gp14 gf23 ga6 pts33', sums && sums.gp === 14 && sums.gf === 23 && sums.ga === 6 && sums.pts === 33 && sums.derived === true, JSON.stringify(sums));
const diffs = JSON.parse(vm.runInContext(`JSON.stringify(diffFHSplit(parseFHTableRow('1\tTeam X\t14\t10\t3\t1\t23\t6\t+17\t33'), parseFHTableRow('1\tTeam X\t7\t6\t1\t0\t15\t2\t+13\t19')))`, sandbox));
check('diff split: away gp7 gf8 ga4', diffs && diffs.gp === 7 && diffs.gf === 8 && diffs.ga === 4 && diffs.derived === true, JSON.stringify(diffs));
check('diff split: negative -> null', vm.runInContext(`diffFHSplit(parseFHTableRow('1\tTeam X\t5\t3\t1\t1\t4\t2\t+2\t10'), parseFHTableRow('1\tTeam X\t7\t6\t1\t0\t15\t2\t+13\t19'))`, sandbox) === null);

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

// --- Test 3b: venue profiles via rankFHTeams ---
vm.runInContext(`var FH_HOME_TEST_ROWS = ${JSON.stringify(HOME_TABLE)}.split('\\n').map(l => l.trim()).filter(l => l.length > 0).map(parseFHTableRow).filter(r => r && r !== 'HEADER');`, sandbox);
vm.runInContext(`var FH_AWAY_TEST_ROWS = ${JSON.stringify(AWAY_TABLE)}.split('\\n').map(l => l.trim()).filter(l => l.length > 0).map(parseFHTableRow).filter(r => r && r !== 'HEADER');`, sandbox);
const ranked3 = JSON.parse(vm.runInContext(`JSON.stringify(rankFHTeams(SAMPLE_TEXT.split('\\n').map(l => l.trim()).filter(l => l.length > 0).map(parseFHTableRow).filter(r => r && r !== 'HEADER'), FH_HOME_TEST_ROWS, FH_AWAY_TEST_ROWS))`, sandbox));
check('Heracles home 17/7 = 2.43', (ranked3.find(t => t.team === 'Heracles Almelo') || {}).homeGpm !== undefined && ranked3.find(t => t.team === 'Heracles Almelo').homeGpm.toFixed(2) === '2.43');
const herS = ranked3.find(t => t.team === 'Heracles Almelo');
check('Heracles away 12/7 = 1.71 + Home-tilted', herS.awayGpm.toFixed(2) === '1.71' && herS.profile === 'Home-tilted', herS.profile + ' ' + herS.awayGpm);
check('Volendam splits -> Balanced (diff 0.14)', ranked3.find(t => t.team === 'FC Volendam').profile === 'Balanced');
check('team without split -> profile ""', ranked3.find(t => t.team === 'FC Den Bosch').profile === '');
const awayTilted = JSON.parse(vm.runInContext(`JSON.stringify(rankFHTeams([{ pos: 1, team: 'T', gp: 4, w: 2, d: 1, l: 1, gf: 7, ga: 3, gd: 4, pts: 7 }], [{ pos: 1, team: 'T', gp: 2, w: 2, d: 0, l: 0, gf: 2, ga: 1, gd: 1, pts: 6 }], [{ pos: 1, team: 'T', gp: 2, w: 0, d: 1, l: 1, gf: 5, ga: 2, gd: 3, pts: 1 }]))`, sandbox));
check('away-tilted profile detected', awayTilted[0].profile === 'Away-tilted', awayTilted[0].profile);

// --- Test 4: full process flow with league input ---
els.fhRawInput.value = SAMPLE;
els.fhLeagueInput.value = 'Eerste Divisie';
vm.runInContext('processFHTable()', sandbox);
check('canon: Eerste Divisie -> Netherlands - Eerste Divisie', vm.runInContext(`canonLeagueTitle('Eerste Divisie')`, sandbox) === 'Netherlands - Eerste Divisie');
check('status: 20 teams + canonical league', els.fhTableStatus.innerText.includes('20 teams parsed') && els.fhTableStatus.innerText.includes('Netherlands - Eerste Divisie'), els.fhTableStatus.innerText);
check('status: Overall variant named', els.fhTableStatus.innerText.includes('Overall'), els.fhTableStatus.innerText);
check('table rendered with FH HOT badge', els.fhTableContent.innerHTML.includes('FH HOT') && els.fhTableContent.innerHTML.includes('Jong FC Utrecht'));
check('no split columns when venue data absent', !els.fhTableContent.innerHTML.includes('Venue Profile'));
check('export button shown', els.fhExportBtn.style.display === 'inline-block');
check('matchups panel visible with fixture hint', panelEl.hidden === false && els.fhMatchupsContent.innerHTML.includes('No upcoming fixtures'), els.fhMatchupsContent.innerHTML.slice(0, 80));

// --- Test 5: CSV export (filename + content, overall only) ---
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
check('CSV no venue sections when absent', !csvText.includes('FH HOME TABLE') && !csvText.includes('FH AWAY TABLE'));

// --- Test 6: no league info on fresh state -> fallback name ---
vm.runInContext('clearFHData()', sandbox);
els.fhLeagueInput.value = '';
check('clearFHData empties textarea', els.fhRawInput.value === '');
check('clearFHData hides export + panel', els.fhExportBtn.style.display === 'none' && panelEl.hidden === true && els.fhTableContent.innerHTML === '');
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

// --- Test 9: Overall + Home + Away combined paste ---
vm.runInContext('clearFHData()', sandbox);
els.fhLeagueInput.value = 'Eerste Divisie';
els.fhRawInput.value = SAMPLE + '\n\n' + HOME_TABLE + '\n\n' + AWAY_TABLE;
vm.runInContext('processFHTable()', sandbox);
check('combined: 20 teams parsed', els.fhTableStatus.innerText.includes('20 teams parsed'), els.fhTableStatus.innerText);
check('combined: variants Overall + Home + Away', els.fhTableStatus.innerText.includes('Overall + Home + Away'), els.fhTableStatus.innerText);
check('combined: nothing derived', !els.fhTableStatus.innerText.includes('derived'), els.fhTableStatus.innerText);
const combHTML = els.fhTableContent.innerHTML;
check('split columns rendered', combHTML.includes('Home FH G/M') && combHTML.includes('Away FH G/M') && combHTML.includes('Venue Profile'));
check('Heracles Home-tilted badge in table', combHTML.includes('Home-tilted'));
check('Heracles 2.43 home / 1.71 away in table', combHTML.includes('<td>2.43</td><td>1.71</td><td>Home-tilted</td>'), combHTML.slice(combHTML.indexOf('Heracles'), combHTML.indexOf('Heracles') + 400));

// --- Test 10: expected FH goals for upcoming fixtures ---
vm.runInContext(`globalFixtures = [
  { date: '01/06/2027', round: 'R29', league: 'Netherlands - Eerste Divisie', homeTeam: 'Heracles Almelo', awayTeam: 'FC Volendam' },
  { date: '15/06/2027', round: 'R30', league: '', homeTeam: 'Almere City', awayTeam: 'VVV-Venlo' },
  { date: '01/06/2027', homeTeam: 'Heracles Almelo', awayTeam: 'Real Madrid' },
  { date: '01/01/2000', homeTeam: 'Heracles Almelo', awayTeam: 'FC Volendam' }
];`, sandbox);
const mus = JSON.parse(vm.runInContext(`JSON.stringify(getUpcomingFHMatchups(globalFixtures, todayUK()))`, sandbox));
check('matchups: 2 found (unknown + past excluded)', mus.length === 2, `got ${mus.length}`);
check('matchups: Heracles v Volendam exp 2.00 HIGH', mus[0].homeTeam === 'Heracles Almelo' && mus[0].exp.toFixed(2) === '2.00' && mus[0].confidence === 'HIGH' && mus[0].hot === true, JSON.stringify(mus[0]));
check('matchups: host 2.43 / visitor 1.57', mus[0].hVenue.toFixed(2) === '2.43' && mus[0].aVenue.toFixed(2) === '1.57', `${mus[0].hVenue} / ${mus[0].aVenue}`);
check('matchups: Almere v VVV exp 1.57 hot (>= 1.5)', mus[1].homeTeam === 'Almere City' && mus[1].exp.toFixed(2) === '1.57' && mus[1].hot === true, JSON.stringify(mus[1]));
vm.runInContext('renderFHMatchups()', sandbox);
check('matchups panel: card + FH MATCH + confidence', els.fhMatchupsContent.innerHTML.includes('2.00 exp. FH goals') && els.fhMatchupsContent.innerHTML.includes('FH MATCH') && els.fhMatchupsContent.innerHTML.includes('confidence HIGH'), els.fhMatchupsContent.innerHTML.slice(0, 200));

// --- Test 10b: fixture + home/away dropdowns + selected-match card ---
check('dropdowns: fixture select lists upcoming only', els.fhFixtureSelect.innerHTML.includes('Heracles Almelo vs FC Volendam') && els.fhFixtureSelect.innerHTML.includes('Almere City vs VVV-Venlo') && !els.fhFixtureSelect.innerHTML.includes('01/01/2000'), els.fhFixtureSelect.innerHTML);
check('dropdowns: team selects have FH + fixture teams', els.fhHomeSelect.innerHTML.includes('<option value="Heracles Almelo">') && els.fhHomeSelect.innerHTML.includes('<option value="Real Madrid">') && els.fhHomeSelect.innerHTML.includes('<option value="FC Den Bosch">'), els.fhHomeSelect.innerHTML.slice(0, 300));
els.fhHomeSelect.value = 'Almere City';
vm.runInContext('refreshFHFixtureDropdowns()', sandbox);
check('dropdowns: selection survives refresh', els.fhHomeSelect.value === 'Almere City', els.fhHomeSelect.value);
els.fhHomeSelect.value = '';
vm.runInContext('refreshFHFixtureDropdowns()', sandbox);
els.fhFixtureSelect.value = '0';
vm.runInContext('onFHFixtureSelect()', sandbox);
check('fixture select: auto-fills home + away', els.fhHomeSelect.value === 'Heracles Almelo' && els.fhAwaySelect.value === 'FC Volendam', els.fhHomeSelect.value + ' / ' + els.fhAwaySelect.value);
let card = els.fhSelectedMatchCard.innerHTML;
check('card: 2.00 exp + HIGH + FH MATCH + fixture context', card.includes('<strong style="color:#e83e8c;">2.00</strong>') && card.includes('>HIGH<') && card.includes('FH MATCH') && card.includes('01/06/2027') && card.includes('R29'), card.slice(0, 400));
check('card: host Home table rate 2.43, visitor Away table 1.57', card.includes('2.43 FH goals/match (Home table, 7 GP)') && card.includes('1.57 FH goals/match (Away table, 7 GP)'), card.slice(card.indexOf('Host'), card.indexOf('Host') + 300));
check('card: FH HOT badges on both teams', (card.match(/FH HOT/g) || []).length === 2, (card.match(/FH HOT/g) || []).length);
els.fhFixtureSelect.value = '';
els.fhHomeSelect.value = 'Heracles Almelo';
els.fhAwaySelect.value = 'FC Den Bosch';
vm.runInContext('onFHTeamSelect()', sandbox);
card = els.fhSelectedMatchCard.innerHTML;
check('card: custom pairing Heracles v Den Bosch 1.91 MEDIUM', card.includes('1.91') && card.includes('>MEDIUM<') && card.includes('(custom pairing)') && card.includes('1.38 FH goals/match (Overall fallback, 13 GP)'), card.slice(0, 500));
els.fhHomeSelect.value = 'Heracles Almelo';
els.fhAwaySelect.value = 'Real Madrid';
vm.runInContext('onFHTeamSelect()', sandbox);
check('card: team outside FH tables -> hint', els.fhSelectedMatchCard.innerHTML.includes('Real Madrid is not in the FH table(s)'), els.fhSelectedMatchCard.innerHTML);
els.fhHomeSelect.value = '';
els.fhAwaySelect.value = '';
vm.runInContext('onFHTeamSelect()', sandbox);
check('card: empty selection -> cleared', els.fhSelectedMatchCard.innerHTML === '');

// --- Test 11: combined CSV export ---
linkAttrs = null;
vm.runInContext('exportFHReportCSV()', sandbox);
const csv2 = linkAttrs ? decodeURIComponent(linkAttrs.attrs.href) : '';
check('CSV combined: Section 2 home table', csv2.includes('SECTION 2: FH HOME TABLE (PASTED)'), csv2.split('\n').filter(l => l.startsWith('SECTION')).join(' | '));
check('CSV combined: Section 3 away table', csv2.includes('SECTION 3: FH AWAY TABLE (PASTED)'));
check('CSV combined: Section 4 matchups', csv2.includes('SECTION 4: UPCOMING FIXTURES - EXPECTED FIRST-HALF GOALS'));
check('CSV combined: venue columns in header', csv2.includes('Home GP,Home FH Goals/Match,Away GP,Away FH Goals/Match,Venue Profile'));
check('CSV combined: Heracles row with venue data', csv2.includes('"Heracles Almelo","14","23","6","+17","2.07","1.64","0.43","2.36","YES","7","2.43","7","1.71","Home-tilted"'), csv2.split('\n').find(l => l.includes('Heracles')));
check('CSV combined: matchup row values', csv2.includes('"2.43","1.57","2.00","HIGH","FH goals candidate'), csv2.split('\n').find(l => l.includes('HIGH')));
check('CSV combined: split source line', csv2.includes('Split source - Overall: pasted | Home: pasted | Away: pasted'));
check('CSV combined: home table raw row', csv2.includes('"Heracles Almelo","7","6","1","0","15","2","+13","19","2.43"'));

// --- Test 12: Overall + Home only -> away derived ---
vm.runInContext('clearFHData()', sandbox);
els.fhLeagueInput.value = 'Eerste Divisie';
els.fhRawInput.value = SAMPLE + '\n\n' + HOME_TABLE;
vm.runInContext('processFHTable()', sandbox);
check('derived: away derived noted', els.fhTableStatus.innerText.includes('away derived'), els.fhTableStatus.innerText);
const derHTML = els.fhTableContent.innerHTML;
check('derived: Volendam away 11/7 = 1.57 shown', derHTML.includes('<td>1.71</td><td>1.57</td>'), derHTML.slice(derHTML.indexOf('Volendam'), derHTML.indexOf('Volendam') + 300));
check('derived: Volendam Balanced (0.14 gap)', (derHTML.match(/Balanced/g) || []).length >= 1);
linkAttrs = null;
vm.runInContext('exportFHReportCSV()', sandbox);
const csv3 = linkAttrs ? decodeURIComponent(linkAttrs.attrs.href) : '';
check('derived CSV: home pasted section, no away section', csv3.includes('SECTION 2: FH HOME TABLE (PASTED)') && !csv3.includes('FH AWAY TABLE (PASTED)'), csv3.split('\n').filter(l => l.startsWith('SECTION')).join(' | '));
check('derived CSV: split source away derived', csv3.includes('Split source - Overall: pasted | Home: pasted | Away: derived'));

// --- Test 13: Home + Away only -> overall derived ---
vm.runInContext('clearFHData()', sandbox);
els.fhLeagueInput.value = '';
els.fhRawInput.value = HOME_TABLE + '\n\n' + AWAY_TABLE;
vm.runInContext('processFHTable()', sandbox);
check('sum: overall derived noted', els.fhTableStatus.innerText.includes('overall derived'), els.fhTableStatus.innerText);
check('sum: 6 teams parsed (no skip msg)', els.fhTableStatus.innerText.includes('6 teams parsed') && !els.fhTableStatus.innerText.includes('skipped'), els.fhTableStatus.innerText);
const herSum = JSON.parse(vm.runInContext(`JSON.stringify(fhTableTeams.find(t => t.team === 'Heracles Almelo'))`, sandbox));
check('sum: Heracles overall gp14 gf23 ga6 = 2.07', herSum.gp === 14 && herSum.gf === 23 && herSum.ga === 6 && herSum.goalsPerMatch.toFixed(2) === '2.07' && herSum.entertaining === true, JSON.stringify(herSum));
check('sum: league kept as fallback -> First Half Table', vm.runInContext(`fhLeague`, sandbox) === 'First Half Table', vm.runInContext(`fhLeague`, sandbox));

// --- Test 14: home table pasted alone -> teams skipped with hint ---
vm.runInContext('clearFHData()', sandbox);
els.fhRawInput.value = HOME_TABLE;
vm.runInContext('processFHTable()', sandbox);
check('home alone: 0 teams + skipped hint', els.fhTableStatus.innerText.includes('0 teams parsed') && els.fhTableStatus.innerText.includes('need Overall or Home+Away'), els.fhTableStatus.innerText);
check('home alone: export hidden', els.fhExportBtn.style.display === 'none' && panelEl.hidden === true);

// --- Test 15: merge keeps previous variants ---
vm.runInContext('clearFHData()', sandbox);
els.fhLeagueInput.value = 'Eerste Divisie';
els.fhRawInput.value = SAMPLE;
vm.runInContext('processFHTable()', sandbox);
els.fhRawInput.value = HOME_TABLE;
vm.runInContext('processFHTable()', sandbox);
check('merge: second paste adds Home, keeps Overall', els.fhTableStatus.innerText.includes('Home') && els.fhTableStatus.innerText.includes('away derived'), els.fhTableStatus.innerText);
check('merge: still 20 teams', els.fhTableStatus.innerText.includes('20 teams parsed'), els.fhTableStatus.innerText);

console.log(failed === 0 ? '\nALL TESTS PASS' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
