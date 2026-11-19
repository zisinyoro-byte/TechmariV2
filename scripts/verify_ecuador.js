// Manual verification: buildFhPasteFromHtml against the Ecuador 2026 en-gb fixture.
// Dev loop for Task 18 — kept for future regression probing.
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
const els = {};
['fhRawInput', 'fhLeagueInput', 'fhTableStatus', 'fhTableContent', 'fhExportBtn', 'fhFixtureSelect', 'fhHomeSelect', 'fhAwaySelect', 'fhSelectedMatchCard', 'fhMatchupsContent', 'fhSsUrlInput', 'swUrlInput'].forEach(id => els[id] = { value: '', innerHTML: '', innerText: '', style: {}, disabled: false, textContent: '' });
const sandbox = {
  console, alert: () => {}, setTimeout,
  document: {
    getElementById: id => els[id] || { style: {}, innerText: '', innerHTML: '', classList: { add() {}, remove() {} } },
    querySelector: () => ({ innerHTML: '', style: {} }),
    createElement: () => ({ attrs: {}, setAttribute() {}, click() {}, style: {} }),
    body: { appendChild() {}, removeChild() {} }
  }
};
sandbox.globalMatches = []; sandbox.globalFixtures = [];
const { JSDOM } = require('jsdom');
const domWindow = new JSDOM('').window;
sandbox.DOMParser = domWindow.DOMParser; sandbox.Node = domWindow.Node; sandbox.URL = URL;
sandbox.localStorage = { store: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } };
function extract(name) {
  let start = js.indexOf('function ' + name + '(');
  if (start >= 6 && js.slice(start - 6, start) === 'async ') start -= 6;
  let i = js.indexOf('{', start), depth = 0, end = -1;
  for (; i < js.length; i++) { if (js[i] === '{') depth++; else if (js[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
  return js.slice(start, end);
}
const leagStart = js.indexOf('const LEAGUE_NAMES'), leagEnd = js.indexOf('};', leagStart) + 2;
const aliasStart = js.indexOf('const LEAGUE_TITLE_ALIASES'), aliasEnd = js.indexOf('};', aliasStart) + 2;
const code = [js.slice(leagStart, leagEnd), js.slice(aliasStart, aliasEnd), extract('canonLeagueTitle'), extract('parseFHTableRow'), extract('detectFHVARIANT'), extract('parseFHPaste'), extract('extractLeagueFromFhTitle'), extract('detectFHLeagueTitle'), extract('soccerstatsTableLines'), extract('findSectionTable'), extract('parseSsDistTable'), extract('parseSsRecordTable'), extract('fhLeagueFromPageTitle'), extract('fhLeagueFromSoccerstatsUrl'), extract('buildFhPasteFromHtml')].join('\n');
vm.createContext(sandbox); vm.runInContext(code, sandbox);
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'ecuador_halftime_2026.html'), 'utf8');
const built = JSON.parse(vm.runInContext('JSON.stringify(buildFhPasteFromHtml(' + JSON.stringify(fixture) + ', "https://www.soccerstats.com/en-gb/leagues/ecuador/liga-pro/ecuador/halftime"))', sandbox));
console.log('ok:', built.ok, '| league:', built.league, '| found:', JSON.stringify(built.found));
const segs = JSON.parse(vm.runInContext('JSON.stringify(parseFHPaste(' + JSON.stringify(built.text.split('\n')) + '))', sandbox)).segs;
console.log('overall rows:', segs.overall.length, '| first:', segs.overall[0] && segs.overall[0].team, '| pos1 GF/GA:', segs.overall[0] && segs.overall[0].gf + '/' + segs.overall[0].ga);
console.log('second rows:', segs.second.length, '| first:', segs.second[0] && segs.second[0].team);
console.log('home first:', segs.home[0] && segs.home[0].team, '| away first:', segs.away[0] && segs.away[0].team);
console.log('2H home first:', segs.secondHome[0] && segs.secondHome[0].team, '| 2H away first:', segs.secondAway[0] && segs.secondAway[0].team);
console.log('dist rows:', built.extras.dist.length, '| lead:', built.extras.lead.length, '| trail:', built.extras.trail.length);
console.log('Manta dist:', JSON.stringify(built.extras.dist.find(r => r.team === 'Manta')));
console.log('Macara lead:', JSON.stringify(built.extras.lead.find(r => r.team === 'Macara')));
console.log('Delfin lead:', JSON.stringify(built.extras.lead.find(r => r.team === 'Delfin')));
console.log('Aucas trail:', JSON.stringify(built.extras.trail.find(r => r.team === 'Aucas')));
