// Syntax-check + functional test: Soccerway.com auto-fetch -> first paste box
// Covers: embedded feed decoding (AE/AF/AG/AH/ADE/ER), dedupe of the repeated
//         recent-window feed, league derivation from URL slugs, epoch->UK date,
//         paste-text generation, end-to-end processData() contract, fetch flow
//         (mocked proxy) success + failure paths.
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

// 2) Sample feed — real field sequences copied from a live soccerway.com
//    league results page (scotland/league-two, scores verified 60/60 against
//    football-data.co.uk). Includes: 2 played Round 13 events, one synthetic
//    2-digit-score Round 12 event (isScore boundary), 2 scheduled events,
//    malformed segments, and exact duplicates of the played events (the page
//    repeats a recent window of rounds in a second feed copy).
const EV = (s) => s;  // readability alias
const E_A = EV('AA÷evt13a¬AD÷1794063600¬ADE÷1794063600¬AB÷3¬CR÷3¬AC÷3¬CX÷Annan¬ER÷Round 13¬RW÷0¬AX÷1¬AO÷1794070412¬BW÷0¬BX÷-1¬WL÷¬WM÷ANN¬PX÷MusLmn5f¬AE÷Annan¬FH÷Annan¬JA÷jBqEpOxR¬WU÷annan¬AJ÷1¬GRA÷0¬AG÷1¬AT÷1¬BC÷1¬OA÷x.png¬WN÷KEL¬PY÷UHbVkIde¬AF÷Kelty Hearts¬FK÷Kelty Hearts¬JB÷Mgzpu20l¬WV÷kelty-hearts¬AS÷2¬AZ÷2¬GRB÷0¬AH÷2¬AU÷2¬BD÷1¬OB÷y.png¬BGS÷{"GB":[16]}¬AW÷1');
const E_B = EV('AA÷evt13b¬AD÷1794063600¬ADE÷1794063600¬AB÷3¬CR÷3¬AC÷3¬CX÷Clyde¬ER÷Round 13¬RW÷0¬AX÷1¬AO÷1794070426¬BW÷0¬BX÷-1¬WL÷¬WM÷CLY¬PX÷rJHaVYqp¬AE÷Clyde¬FH÷Clyde¬JA÷f7YiwtV0¬WU÷clyde¬AS÷1¬AZ÷1¬GRA÷0¬AG÷3¬AT÷3¬BC÷2¬OA÷u.png¬WN÷SPA¬PY÷tGIU5Y1p¬AF÷Spartans¬FK÷Spartans¬JB÷SYoayKaD¬WV÷spartans¬GRB÷0¬AH÷2¬AU÷2¬BD÷0¬OB÷v.png¬BGS÷{"GB":[16]}¬AW÷1');
const E_C = EV('AA÷evt12a¬AD÷1793458800¬ADE÷1793458800¬AB÷3¬CR÷3¬AC÷3¬CX÷Stranraer¬ER÷Round 12¬RW÷0¬AX÷1¬AO÷1793465561¬BW÷0¬BX÷-1¬WL÷¬WM÷STR¬PX÷vudJXTkl¬AE÷Stranraer¬FH÷Stranraer¬JA÷aa¬WU÷stranraer¬AJ÷1¬GRA÷0¬AG÷10¬AT÷10¬BC÷5¬OA÷s.png¬WN÷CLY¬PY÷rJHaVYqp¬AF÷Clyde¬FK÷Clyde¬JB÷pfjCQ2oe¬WV÷clyde¬AS÷0¬AZ÷0¬GRB÷0¬AH÷0¬AU÷0¬BD÷0¬OB÷c.png¬BGS÷{"GB":[16]}¬AW÷1');
const E_S1 = EV('AA÷KMgHXxlI¬AD÷1794668400¬ADE÷1794668400¬AB÷1¬CR÷1¬AC÷1¬CX÷Dumbarton¬ER÷Round 14¬RW÷0¬AX÷0¬BW÷0¬BX÷-1¬WL÷¬WM÷DUM¬PX÷S6Xv3lj1¬AE÷Dumbarton¬FH÷Dumbarton¬JA÷zyDd6vam¬WU÷dumbarton¬GRA÷0¬OA÷d.png¬WN÷ANN¬PY÷MusLmn5f¬AF÷Annan¬FK÷Annan¬JB÷8lB44ITa¬WV÷annan¬GRB÷0¬OB÷a.png¬AL÷{"1":[{"TVI":5357}]}¬BGS÷{"GB":[16]}¬AW÷0');
const E_S2 = EV('AA÷evt14b¬AD÷1794668400¬ADE÷1794668400¬AB÷1¬CR÷1¬AC÷1¬CX÷Elgin City¬ER÷Round 14¬RW÷0¬AX÷0¬BW÷0¬BX÷-1¬WL÷¬WM÷ELG¬PX÷rPhWvCcE¬AE÷Elgin City¬FH÷Elgin City¬JA÷fuvoaNiK¬WU÷elgin-city¬GRA÷0¬OA÷e.png¬WN÷SPA¬PY÷tGIU5Y1p¬AF÷Spartans¬FK÷Spartans¬JB÷SYoayKaD¬WV÷spartans¬GRB÷0¬OB÷sp.png¬BGS÷{"GB":[16]}¬AW÷0');
const E_BAD1 = EV('AA÷bad1¬ER÷Round 14¬AE÷Ghost¬AF÷TeamX¬AG÷1¬AH÷1');               // no ADE
const E_BAD2 = EV('AA÷bad2¬ADE÷1794063600¬AE÷¬AF÷¬AG÷1¬AH÷1');                          // empty names
const E_BAD3 = EV('AA÷bad3¬ADE÷1794063600¬AE÷Weird FC¬AF÷Odd United¬AG÷2-1¬AH÷1');      // non-numeric score -> not played
const SAMPLE_HTML = ['<html><script>', E_A, E_B, E_C, E_S1, E_S2, E_BAD1, E_BAD2, E_BAD3, E_A, E_B, '</script></html>'].join('\n');
const SCHED_ONLY_HTML = ['<html><script>', E_S1, E_S2, '</script></html>'].join('\n');

// 3) Sandbox
const elements = {};
function el(id) {
  if (!elements[id]) {
    const e = { id: id, value: '', innerText: '', textContent: '', disabled: false, style: {}, classList: { remove() {}, add() {} }, options: [], _html: '' };
    Object.defineProperty(e, 'innerHTML', { get() { return e._html; }, set(v) { e._html = v; if (v === '') e.options = []; } });
    e.add = (o) => { e.options.push(o); };
    elements[id] = e;
  }
  return elements[id];
}
const sandbox = {
  console,
  URL,
  document: {
    getElementById: (id) => el(id),
    querySelector: () => ({ innerHTML: '', style: {}, classList: { remove() {}, add() {} } }),
    createElement: () => ({ setAttribute() {}, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  },
  localStorage: {
    _saved: {},
    getItem(k) { return this._saved[k] || null; },
    setItem(k, v) { this._saved[k] = String(v); }
  },
  setTimeout,
  alert: () => {}
};
sandbox.globalMatches = [];
sandbox.globalFixtures = [];
sandbox.globalSwFixtures = [];
sandbox.globalSwFixturesLeague = '';

function extract(name) {
  const asyncStart = js.indexOf(`async function ${name}(`);
  const plainStart = js.indexOf(`function ${name}(`);
  const start = asyncStart !== -1 ? asyncStart : plainStart;
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
${extract('isValidDate')}
${extract('parseSoccerwayFeed')}
${extract('swLeagueFromUrl')}
${extract('swDateFromEpoch')}
${extract('swTimeFromEpoch')}
${extract('soccerwayFixturesFromFeed')}
${extract('clearSwFixtures')}
${extract('setSwFixtures')}
${extract('refreshSwFixtureDropdown')}
${extract('onSwFixtureSelect')}
${extract('buildSoccerwayPaste')}
${extract('fetchSoccerwayResults')}
${extract('processData')}
function renderTable(){ }
`;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let failed = 0;
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${cond ? '' : ' -> ' + (detail || '')}`);
  if (!cond) failed++;
}

const run = (expr) => vm.runInContext(expr, sandbox);

// --- Test 1: feed decoding + dedupe + sort ---
const events = run(`parseSoccerwayFeed(${JSON.stringify(SAMPLE_HTML)})`);
check('unique events = 6 (duplicates + malformed dropped)', events.length === 6, `got ${events.length}`);
check('played = 3, scheduled = 3', events.filter(e => e.homeScore !== null).length === 3 && events.filter(e => e.homeScore === null).length === 3, JSON.stringify(events.map(e => e.homeScore)));
check('epochs sorted ascending', events.every((e, i) => i === 0 || events[i - 1].epoch <= e.epoch), JSON.stringify(events.map(e => e.epoch)));
const annan = events.find(e => e.home === 'Annan');
check('Annan event: Round 13, 1-2 vs Kelty Hearts', annan && annan.round === 'Round 13' && annan.away === 'Kelty Hearts' && annan.homeScore === 1 && annan.awayScore === 2, JSON.stringify(annan));
const clyde = events.find(e => e.home === 'Clyde' && e.homeScore !== null);
check('Clyde event: 3-2 vs Spartans', clyde && clyde.homeScore === 3 && clyde.awayScore === 2, JSON.stringify(clyde));
const stranraer = events.find(e => e.home === 'Stranraer');
check('2-digit score boundary parsed (10-0)', stranraer && stranraer.homeScore === 10 && stranraer.awayScore === 0, JSON.stringify(stranraer));
const weird = events.find(e => e.home === 'Weird FC');
check('non-numeric score -> treated as unplayed', weird && weird.homeScore === null && weird.awayScore === null, JSON.stringify(weird));
check('scheduled events carry no scores', events.filter(e => e.round === 'Round 14').every(e => e.homeScore === null), JSON.stringify(events.filter(e => e.round === 'Round 14')));

// --- Test 2: league derivation from URL slugs ---
check('current-season URL -> Scotland - League Two', run(`swLeagueFromUrl('https://www.soccerway.com/scotland/league-two/results/')`) === 'Scotland - League Two', run(`swLeagueFromUrl('https://www.soccerway.com/scotland/league-two/results/')`));
check('archive URL season suffix stripped', run(`swLeagueFromUrl('https://www.soccerway.com/scotland/league-two-2025-2026/results/')`) === 'Scotland - League Two', run(`swLeagueFromUrl('https://www.soccerway.com/scotland/league-two-2025-2026/results/')`));
check('numeric league slug title-cased', run(`swLeagueFromUrl('https://www.soccerway.com/germany/2-bundesliga/results/')`) === 'Germany - 2 Bundesliga', run(`swLeagueFromUrl('https://www.soccerway.com/germany/2-bundesliga/results/')`));
check('country-only path -> empty', run(`swLeagueFromUrl('https://www.soccerway.com/scotland/')`) === '');
check('garbage input -> empty', run(`swLeagueFromUrl('not a url')`) === '');
check('URL league canonicalized via aliases (SC3)', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/scotland/league-two/results/'))`) === 'Scotland - League 2', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/scotland/league-two/results/'))`));
check('D2 canonical via aliases', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/germany/2-bundesliga/results/'))`) === 'Germany - 2. Bundesliga', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/germany/2-bundesliga/results/'))`));
check('unknown league kept readable', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/scotland/highland-football-league/results/'))`) === 'Scotland - Highland Football League', run(`canonLeagueTitle(swLeagueFromUrl('https://www.soccerway.com/scotland/highland-football-league/results/'))`));

// --- Test 3: epoch -> UK date (values verified against football-data.co.uk CSV) ---
check('1793458800 -> 31.10.2026', run(`swDateFromEpoch(1793458800)`) === '31.10.2026', run(`swDateFromEpoch(1793458800)`));
check('1794063600 -> 07.11.2026', run(`swDateFromEpoch(1794063600)`) === '07.11.2026', run(`swDateFromEpoch(1794063600)`));
check('1794668400 -> 14.11.2026', run(`swDateFromEpoch(1794668400)`) === '14.11.2026', run(`swDateFromEpoch(1794668400)`));
check('1794668400 -> 15:00 UK (GMT)', run(`swTimeFromEpoch(1794668400)`) === '15:00', run(`swTimeFromEpoch(1794668400)`));
check('1786802400 -> 15:00 UK (BST; raw UTC getters would give 14:00)', run(`swTimeFromEpoch(1786802400)`) === '15:00', run(`swTimeFromEpoch(1786802400)`));

// --- Test 4: paste-text generation ---
const built = run(`buildSoccerwayPaste(${JSON.stringify(SAMPLE_HTML)}, 'https://www.soccerway.com/scotland/league-two/results/')`);
check('built ok', built.ok === true, JSON.stringify(built));
check('results=3, rounds=2, fixtures=3', built.results === 3 && built.rounds === 2 && built.fixtures === 3, `${built.results}/${built.rounds}/${built.fixtures}`);
check('league line is canonical', built.text.startsWith('Scotland - League 2\n'), built.text.split('\n')[0]);
const expectedText = [
  'Scotland - League 2',
  'Round 12',
  'Stranraer', 'Stranraer', 'Clyde', 'Clyde', '10', '0', '31.10.2026',
  'Round 13',
  'Annan', 'Annan', 'Kelty Hearts', 'Kelty Hearts', '1', '2', '07.11.2026',
  'Clyde', 'Clyde', 'Spartans', 'Spartans', '3', '2', '07.11.2026'
].join('\n');
check('paste text matches expected block format exactly', built.text === expectedText, JSON.stringify(built.text));

// --- Test 5: fixtures-only / empty pages fail gracefully ---
const fx = run(`buildSoccerwayPaste(${JSON.stringify(SCHED_ONLY_HTML)}, 'https://www.soccerway.com/scotland/league-two/results/')`);
check('fixtures-only page -> ok:false', fx.ok === false, JSON.stringify(fx));
check('error mentions RESULTS url', /results/i.test(fx.error), fx.error);
const empty = run(`buildSoccerwayPaste('', 'https://www.soccerway.com/scotland/league-two/results/')`);
check('empty html -> ok:false, results=0', empty.ok === false && empty.results === 0, JSON.stringify(empty));
check('empty html -> fixtures counted 0', empty.fixtures === 0, `${empty.fixtures}`);

// --- Test 6: END-TO-END — generated paste parses through processData() ---
run(`globalMatches = []; globalFixtures = [];`);
run(`setSwFixtures(soccerwayFixturesFromFeed(${JSON.stringify(SAMPLE_HTML)}, 'Scotland - League 2'), 'Scotland - League 2')`);
el('rawInput').value = built.text;
run('processData()');
const gm = run('globalMatches');
check('processData: 3 matches loaded', gm.length === 3, `got ${gm.length}`);
check('match 1: Round 12, Stranraer 10-0 Clyde, 31.10.2026', gm[0] && gm[0].round === 'Round 12' && gm[0].homeTeam === 'Stranraer' && gm[0].awayTeam === 'Clyde' && gm[0].homeScore === 10 && gm[0].awayScore === 0 && gm[0].date === '31.10.2026', JSON.stringify(gm[0]));
check('match 2: Round 13, Annan 1-2 Kelty Hearts, 07.11.2026', gm[1] && gm[1].round === 'Round 13' && gm[1].homeTeam === 'Annan' && gm[1].awayTeam === 'Kelty Hearts' && gm[1].homeScore === 1 && gm[1].awayScore === 2 && gm[1].date === '07.11.2026', JSON.stringify(gm[1]));
check('match 3: Round 13, Clyde 3-2 Spartans, 07.11.2026', gm[2] && gm[2].round === 'Round 13' && gm[2].homeTeam === 'Clyde' && gm[2].awayTeam === 'Spartans' && gm[2].homeScore === 3 && gm[2].awayScore === 2 && gm[2].date === '07.11.2026', JSON.stringify(gm[2]));
check('all matches carry canonical league name', gm.every(x => x.league === 'Scotland - League 2'), JSON.stringify(gm.map(x => x.league)));
check('no fixtures captured from paste', run('globalFixtures').length === 0, `${run('globalFixtures').length}`);
check('processData clears captured Soccerway fixtures', run('globalSwFixtures.length') === 0 && el('swFixtureSelect').options.length === 1 && el('swFixtureSelect').options[0].text.includes('No upcoming fixtures loaded'), `${run('globalSwFixtures').length} | ${el('swFixtureSelect').options.map(o => o.text).join(' | ')}`);

// --- Test 7: fetch flow (mocked proxy) — success ---
run(`globalMatches = []; globalFixtures = [];`);
let fetchArg = null;
const setFetch = (fn) => { sandbox.fetch = fn; };  // context-global: visible to extracted functions
setFetch(async (url) => { fetchArg = url; return { ok: true, text: async () => SAMPLE_HTML, headers: { get: () => 'direct' } }; });
el('swUrlInput').value = 'https://www.soccerway.com/scotland/league-two/results/';
el('rawInput').value = 'OLD PASTE CONTENT';
el('statusArea').innerText = '';
(async () => {
  await run('fetchSoccerwayResults()');
  check('proxy URL passed as /api/soccerway.js?url=<encoded>', fetchArg === '/api/soccerway.js?url=' + encodeURIComponent('https://www.soccerway.com/scotland/league-two/results/'), String(fetchArg));
  check('textarea filled with generated paste', el('rawInput').value === expectedText, el('rawInput').value.slice(0, 60));
  check('status prefixed with fetch summary + league', el('statusArea').innerText.startsWith('Fetched from Soccerway: 3 result(s) in 2 round(s) — Scotland - League 2. 3 upcoming fixture(s) listed in the Step 2 dropdown.'), el('statusArea').innerText);
  check('fetch captured 3 upcoming fixtures', run('globalSwFixtures.length') === 3, `${run('globalSwFixtures.length')}`);
  check('fixture dropdown refilled after fetch (placeholder + 3)', el('swFixtureSelect').options.length === 4 && el('swFixtureSelect').options[0].text.includes('Upcoming fixtures: 3 loaded'), el('swFixtureSelect').options.map(o => o.text).join(' | '));
  check('status green', el('statusArea').style.color === '#28a745', el('statusArea').style.color);
  check('processData ran (3 matches)', run('globalMatches').length === 3, `${run('globalMatches').length}`);
  check('button restored', el('swFetchBtn').textContent === 'Fetch Results' && el('swFetchBtn').disabled === false, `${el('swFetchBtn').textContent}/${el('swFetchBtn').disabled}`);
  check('URL remembered in localStorage', sandbox.localStorage._saved['techmari_sw_url'] === 'https://www.soccerway.com/scotland/league-two/results/', JSON.stringify(sandbox.localStorage._saved));

  // --- Test 8: fetch flow — HTTP 502 ---
  run(`globalMatches = [];`);
  el('rawInput').value = 'SENTINEL';
  el('statusArea').innerText = '';
  sandbox.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'soccerway_unreachable', detail: ' The Soccerway page could not be fetched.' }), text: async () => '{"error":"soccerway_unreachable"}' });
  await run('fetchSoccerwayResults()');
  check('502 -> failure status with detail', el('statusArea').innerText.includes('Fetch failed (HTTP 502)') && el('statusArea').innerText.includes('could not be fetched'), el('statusArea').innerText);
  check('502 -> textarea untouched', el('rawInput').value === 'SENTINEL', el('rawInput').value);
  check('502 -> no matches loaded', run('globalMatches').length === 0, `${run('globalMatches').length}`);

  // --- Test 9: fetch flow — blocked page (no feed) ---
  el('rawInput').value = 'SENTINEL';
  el('statusArea').innerText = '';
  sandbox.fetch = async () => ({ ok: true, text: async () => '<html>Access to this page has been denied. captcha/deliver</html>', headers: { get: () => 'direct' } });
  await run('fetchSoccerwayResults()');
  check('blocked page -> Soccerway fetch error status', el('statusArea').innerText.startsWith('Soccerway fetch:'), el('statusArea').innerText);
  check('blocked page -> textarea untouched', el('rawInput').value === 'SENTINEL', el('rawInput').value);

  // --- Test 10: input validation ---
  el('swUrlInput').value = '';
  el('statusArea').innerText = '';
  await run('fetchSoccerwayResults()');
  check('empty input -> prompt status', el('statusArea').innerText.includes('Paste a Soccerway results page URL first'), el('statusArea').innerText);
  el('swUrlInput').value = 'https://example.com/scotland/league-two/results/';
  el('statusArea').innerText = '';
  await run('fetchSoccerwayResults()');
  check('foreign domain rejected (no network call)', el('statusArea').innerText.includes('Only soccerway.com URLs are supported.') && fetchArg === '/api/soccerway.js?url=' + encodeURIComponent('https://www.soccerway.com/scotland/league-two/results/'), el('statusArea').innerText + ' | ' + String(fetchArg));

  // --- Test 11: captured fixture list + select -> auto-predict flow ---
  run(`setSwFixtures(soccerwayFixturesFromFeed(${JSON.stringify(SAMPLE_HTML)}, 'Scotland - League 2'), 'Scotland - League 2')`);
  const fx3 = run('JSON.parse(JSON.stringify(globalSwFixtures))');
  check('fixtures chronological: 07.11 then 2x 14.11', fx3.length === 3 && fx3[0].date === '07.11.2026' && fx3[1].date === '14.11.2026' && fx3[2].date === '14.11.2026', JSON.stringify(fx3.map(f => f.date)));
  check('fixture fields: league/date/time/round/teams', fx3[1].league === 'Scotland - League 2' && fx3[1].time === '15:00' && fx3[1].round === 'Round 14' && fx3[1].homeTeam === 'Dumbarton' && fx3[1].awayTeam === 'Annan', JSON.stringify(fx3[1]));
  check('roundless fixture kept with empty round', fx3[0].round === '' && fx3[0].homeTeam === 'Weird FC', JSON.stringify(fx3[0]));
  check('dropdown option text: round · date time UK · teams', el('swFixtureSelect').options[2].text === 'Round 14 \u00b7 14.11.2026 15:00 UK \u00b7 Dumbarton vs Annan', el('swFixtureSelect').options[2].text);
  check('dropdown placeholder text when loaded', el('swFixtureSelect').options[0].text === 'Upcoming fixtures: 3 loaded (from Soccerway) \u2014 pick one to auto-predict', el('swFixtureSelect').options[0].text);

  run('var onTeamSelectChangeCalls = []; function onTeamSelectChange(){ onTeamSelectChangeCalls.push(1); }');
  run('var runPredictionCalls = []; function runPrediction(){ runPredictionCalls.push(1); }');
  const teamOpts = ['Dumbarton', 'Annan', 'Elgin City', 'Spartans', 'Kelty Hearts', 'Clyde', 'Stranraer'].map(t => ({ value: t, text: t }));
  el('homeTeamSelect').options = teamOpts.slice();
  el('awayTeamSelect').options = teamOpts.slice();
  el('swFixtureSelect').value = '1';  // Dumbarton vs Annan
  el('statusArea').innerText = '';
  run('onSwFixtureSelect()');
  check('fixture select fills Home dropdown', el('homeTeamSelect').value === 'Dumbarton', el('homeTeamSelect').value);
  check('fixture select fills Away dropdown', el('awayTeamSelect').value === 'Annan', el('awayTeamSelect').value);
  check('prediction auto-runs like the Predict button', run('runPredictionCalls.length') === 1, `${run('runPredictionCalls.length')}`);
  check('selected-team stats card refresh triggered', run('onTeamSelectChangeCalls.length') === 1, `${run('onTeamSelectChangeCalls.length')}`);
  check('green confirmation with round + kickoff', el('statusArea').innerText.startsWith('Predicting upcoming fixture: Dumbarton vs Annan (Round 14, 14.11.2026 15:00 UK)') && el('statusArea').style.color === '#28a745', el('statusArea').innerText);
  check('team dropdowns themselves untouched (fallback intact)', el('homeTeamSelect').options.length === 7 && el('awayTeamSelect').options.length === 7, `${el('homeTeamSelect').options.length}/${el('awayTeamSelect').options.length}`);

  // fixture team missing from processed data -> red guidance, no predict
  el('swFixtureSelect').value = '0';  // Weird FC vs Odd United — not in team dropdowns
  el('statusArea').innerText = '';
  run('onSwFixtureSelect()');
  check('missing fixture team -> red guidance, no predict', run('runPredictionCalls.length') === 1 && el('statusArea').style.color === '#dc3545' && el('statusArea').innerText.includes('Weird FC / Odd United'), el('statusArea').innerText);
  check('fixture dropdown reset on miss', el('swFixtureSelect').value === '', el('swFixtureSelect').value);

  // placeholder selection -> no-op
  el('statusArea').innerText = '';
  el('swFixtureSelect').value = '';
  run('onSwFixtureSelect()');
  check('placeholder selection is a no-op', el('statusArea').innerText === '' && run('runPredictionCalls.length') === 1, el('statusArea').innerText);

  // clearSwFixtures -> placeholder-only state
  run('clearSwFixtures()');
  check('clearSwFixtures -> placeholder only', run('globalSwFixtures.length') === 0 && el('swFixtureSelect').options.length === 1 && el('swFixtureSelect').options[0].text.includes('No upcoming fixtures loaded'), el('swFixtureSelect').options.map(o => o.text).join(' | '));

  console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} TEST(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL: harness error ->', e.message); process.exit(1); });
