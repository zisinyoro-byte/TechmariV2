// Bookmarklet test: the "Copy FH tables" bookmarklet (download/techmari_fh_bookmarklet.html)
// must produce EXACTLY the same paste text as the app's fetch-path builder
// (buildFhPasteFromHtml) when run against the same saved soccerstats page, and its
// output must survive the app's own paste parser with all six tables intact.
//
// Run: node scripts/test_bookmarklet.js   (needs jsdom: npm install jsdom --no-save)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DELIV = '/home/z/my-project/download/techmari_fh_bookmarklet.html';
const FIXTURE = path.join(__dirname, 'fixtures', 'ecuador_halftime_2026.html');
const FIXTURE_URL = 'https://www.soccerstats.com/en-gb/leagues/ecuador/serie-a/ecu1/halftime';

let failed = 0;
const ok = (cond, label) => { if (cond) console.log('PASS: ' + label); else { console.error('FAIL: ' + label); failed++; } };

// ---- Load the bookmarklet source from the deliverable (single source of truth) ----
const delivHtml = fs.readFileSync(DELIV, 'utf8');
const mSrc = delivHtml.match(/<script type="text\/plain" id="bm-src">([\s\S]*?)<\/script>/);
ok(!!mSrc, 'bookmarklet source block found in deliverable');
const bmSrc = mSrc ? mSrc[1].replace(/^\s*\n/, '').replace(/\s+$/, '') : '';

// ---- Extract the app functions needed by buildFhPasteFromHtml ----
const appHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = appHtml.match(/<script>([\s\S]*)<\/script>/);
ok(!!m, 'app script block found');
const js = m ? m[1] : '';

function extract(name) {
    let start = js.indexOf(`function ${name}(`);
    if (start === -1) throw new Error('function not found: ' + name);
    if (start >= 6 && js.slice(start - 6, start) === 'async ') start -= 6;
    let i = js.indexOf('{', start), depth = 0, end = -1;
    for (; i < js.length; i++) {
        if (js[i] === '{') depth++;
        else if (js[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    return js.slice(start, end);
}

const domWindow = new JSDOM('').window;
const sandbox = {
    console, URL, encodeURIComponent, decodeURIComponent, JSON, Object, Array, String, Number, parseInt, isNaN, Set, RegExp,
    DOMParser: domWindow.DOMParser, Node: domWindow.Node,
};
sandbox.globalMatches = [];
sandbox.globalFixtures = [];
vm.createContext(sandbox);

const leagStart = js.indexOf('const LEAGUE_NAMES');
const leagEnd = js.indexOf('};', leagStart) + 2;
const aliasStart = js.indexOf('const LEAGUE_TITLE_ALIASES');
const aliasEnd = js.indexOf('};', aliasStart) + 2;
const code = `
${js.slice(leagStart, leagEnd)}
${js.slice(aliasStart, aliasEnd)}
${extract('canonLeagueTitle')}
${extract('fhLeagueFromPageTitle')}
${extract('fhLeagueFromSoccerstatsUrl')}
${extract('parseFHTableRow')}
${extract('detectFHVARIANT')}
${extract('parseFHPaste')}
${extract('soccerstatsTableLines')}
${extract('findSectionTable')}
${extract('parseSsDistTable')}
${extract('parseSsRecordTable')}
${extract('buildFhPasteFromHtml')}
`;
vm.runInContext(code, sandbox);

// ---- 1) App fetch-path reference output on the fixture ----
const fixtureHtml = fs.readFileSync(FIXTURE, 'utf8');
const app = vm.runInContext(`buildFhPasteFromHtml(${JSON.stringify(fixtureHtml)}, ${JSON.stringify(FIXTURE_URL)})`, sandbox);
ok(app && app.ok === true, 'app buildFhPasteFromHtml parses the fixture (fetch path OK)');
ok(app && Object.keys(app.found || {}).filter(k => app.found[k] > 0).length === 6, 'app found all six tables (1H/2H x overall/home/away)');

// ---- 2) Run the bookmarklet against the same fixture DOM ----
const dom = new JSDOM(fixtureHtml, { runScripts: 'outside-only', url: FIXTURE_URL });
const alerts = [];
dom.window.alert = (msg) => alerts.push(String(msg));
dom.window.eval(bmSrc);
const bmText = dom.window.__bmCopied;
ok(typeof bmText === 'string' && bmText.length > 0, 'bookmarklet produced text on the fixture page');

// ---- 3) Equivalence: bookmarklet text === fetch-path text ----
ok(bmText === app.text, 'bookmarklet output is byte-identical to buildFhPasteFromHtml output');

// ---- 4) The bookmarklet text survives the app paste parser with all six tables ----
const paste = vm.runInContext(`parseFHPaste(${JSON.stringify(String(bmText || '').split('\n'))})`, sandbox);
const segs = paste.segs;
const titles = ['overall', 'home', 'away', 'second', 'secondHome', 'secondAway'];
ok(titles.every(t => Array.isArray(segs[t]) && segs[t].length > 0), 'paste parser: all six segments non-empty');
ok(JSON.stringify(segs.overall) !== JSON.stringify(segs.second), '1H overall rows differ from 2H rows (no half-shift regression)');

const r0 = (segs.overall || [])[0] || {};
ok(r0.team === 'Macara' && r0.gp === 6 && r0.gf === 5 && r0.ga === 1,
    `overall #1 is Macara 6GP 5-1 (got ${JSON.stringify({ team: r0.team, gp: r0.gp, gf: r0.gf, ga: r0.ga })})`);

// ---- 5) Failure path: no tables -> alert, no text ----
const dom2 = new JSDOM('<html><body><p>some blocked page</p></body></html>', { runScripts: 'outside-only', url: FIXTURE_URL });
const alerts2 = [];
dom2.window.alert = (msg) => alerts2.push(String(msg));
dom2.window.eval(bmSrc);
ok(!dom2.window.__bmCopied && alerts2.some(a => /no First\/Second Half tables/i.test(a)),
    'bookmarklet alerts (does not fake output) when the page has no tables');

// ---- 6) Deliverable page builds a sane install link + code box ----
const page = new JSDOM(delivHtml, { runScripts: 'dangerously' });
const href = page.window.document.getElementById('bmLink').getAttribute('href') || '';
const box = page.window.document.getElementById('bmCode').value || '';
ok(/^javascript:\(function/.test(href), 'install link is a javascript: bookmarklet');
ok(decodeURIComponent(href.slice('javascript:'.length)) === bmSrc, 'install link matches the source block (no drift)');
ok(box === 'javascript:' + bmSrc, 'manual-install textarea matches the source block');
ok(href.length < 8000, `install link length sane for bookmark managers (${href.length} chars)`);

// ---- 7) Mobile package: minified single-line variant behaves identically ----
const mobPath = '/home/z/my-project/download/techmari_fh_bookmarklet_mobile.txt';
const mobTxt = fs.readFileSync(mobPath, 'utf8');
const codeLines = mobTxt.split('\n').filter(l => l.startsWith('javascript:'));
ok(codeLines.length === 1, 'mobile txt contains exactly one javascript: code line');
const mobCode = codeLines[0] || '';
ok(!mobCode.slice('javascript:'.length).includes('\n'), 'mobile code is a single line (survives mobile bookmark URL fields)');
ok(mobCode.length < 8000, `mobile code length sane for bookmark managers (${mobCode.length} chars)`);
const dom3 = new JSDOM(fixtureHtml, { runScripts: 'outside-only', url: FIXTURE_URL });
const alerts3 = [];
dom3.window.alert = (msg) => alerts3.push(String(msg));
dom3.window.eval(mobCode.slice('javascript:'.length));
ok(dom3.window.__bmCopied === app.text, 'MINIFIED bookmarklet output is byte-identical to buildFhPasteFromHtml output');
// jsdom has no clipboard API / execCommand, so either alert proves the flow ran to the copy stage
// (success on real browsers with clipboard; fallback message where copy is unavailable).
ok(alerts3.some(a => /FH tables copied \(\d+ tables\)|Copy blocked/.test(a)), 'minified variant runs the full flow to the copy stage');

console.log(failed === 0 ? '\nALL TESTS PASS' : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
