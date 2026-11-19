// Builds the mobile package from the installer page's single source of truth:
//   download/techmari_fh_bookmarklet.html  ->  download/techmari_fh_bookmarklet_mobile.txt
// The txt carries a MINIFIED single-line javascript: bookmarklet — multi-line
// code gets mangled by mobile bookmark-URL fields, so phones need one line.
// Run: node scripts/make_bookmarklet_min.js   (needs terser: npm i terser --no-save)
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const DELIV = '/home/z/my-project/download/techmari_fh_bookmarklet.html';
const OUT = '/home/z/my-project/download/techmari_fh_bookmarklet_mobile.txt';

const html = fs.readFileSync(DELIV, 'utf8');
const m = html.match(/<script type="text\/plain" id="bm-src">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: bm-src block not found'); process.exit(1); }
const src = m[1].replace(/^\s*\n/, '').replace(/\s+$/, '');

minify(src, { compress: { defaults: true }, mangle: false, format: { comments: false } })
    .then(r => {
        const code = 'javascript:' + r.code;
        if (code.includes('\n')) { console.error('FAIL: minified code is not a single line'); process.exit(1); }
        const header = [
            'Techmari "Copy FH tables" bookmarklet — MOBILE package',
            '======================================================',
            '',
            'Runs on a soccerstats.com First/Second Half stats page in your mobile browser',
            '(iOS Safari, Firefox for Android, Samsung Internet). Copies all six 1H/2H tables',
            'to the clipboard, paste-ready for the Techmari app paste box.',
            '',
            'INSTALL: create a bookmark on the soccerstats page, then EDIT that bookmark and',
            'replace its URL with the single line below (copy the WHOLE line, including',
            '"javascript:" — nothing before it, nothing after it). Name: Copy FH tables.',
            'RUN: on the soccerstats page, tap the bookmark (iOS Safari) or type its name in',
            'the address bar and pick the suggestion (Firefox Android).',
            '',
            'THE BOOKMARKLET CODE (one line):',
        ].join('\n');
        fs.writeFileSync(OUT, header + '\n' + code + '\n');
        console.log('PASS: wrote ' + OUT + ' (' + code.length + ' chars single line)');
    })
    .catch(e => { console.error('FAIL: terser error -> ' + e.message); process.exit(1); });
