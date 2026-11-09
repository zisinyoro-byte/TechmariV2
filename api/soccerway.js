/*
 * Vercel Serverless Function — fetches a Soccerway.com league RESULTS page
 * server-side (CORS bypass) and returns the HTML so the browser can decode
 * the embedded match feed into paste-box text (season results for the
 * Statistical data processor).
 *
 * The new Soccerway (LiveSport/Flashscore family) embeds every match of the
 * season in a not-sign-delimited feed (AA÷<id>¬AE÷home¬AF÷away¬AG÷...¬AH÷...)
 * inside a <script> tag; the visible page is rendered client-side from it.
 * There is no anti-bot wall on plain server-side fetches today (verified
 * 2026-11: full 622 KB page returned, feed intact, robots.txt allows league
 * results pages), so a single direct fetch is enough — no reader fallback.
 *
 * Politeness: responses are cached at the edge for 6h (stale-while-revalidate
 * 24h) and upstream requests are paced >= 1.2s apart. On failure the app
 * degrades to the manual paste box.
 */

export const config = {
    runtime: 'nodejs',
};

const MIN_REQUEST_INTERVAL = 1200;
let lastRequestTime = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

function isBlocked(status, body) {
    if ([403, 429, 503].includes(status)) return true;
    const head = String(body || '').slice(0, 4000);
    return /datadome|Attention Required|Just a moment|challenge-platform|Access to this page has been denied|Enable JavaScript and cookies|captcha\/deliver/i.test(head);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const target = String(req.query.url || '');
    let parsed;
    try {
        parsed = new URL(target);
    } catch (e) {
        parsed = null;
    }
    if (!parsed || parsed.protocol !== 'https:' || !/(^|\.)soccerway\.com$/i.test(parsed.hostname)) {
        return res.status(400).json({ error: 'Invalid url parameter — must be an https soccerway.com page URL' });
    }

    // Pace upstream requests (best effort; module state is per-lambda-instance).
    const since = Date.now() - lastRequestTime;
    if (since < MIN_REQUEST_INTERVAL) await delay(MIN_REQUEST_INTERVAL - since);
    lastRequestTime = Date.now();

    try {
        const r = await fetchWithTimeout(parsed.href, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-GB,en;q=0.9',
            },
        });
        const body = await r.text();
        // The embedded feed marker is the only thing the browser decoder needs.
        if (r.ok && !isBlocked(r.status, body) && body.includes('AA\u00f7')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Soccerway-Via', 'direct');
            res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
            return res.status(200).send(body);
        }
        console.warn(`[soccerway] fetch unusable (status=${r.status}, blocked=${isBlocked(r.status, body)}, hasFeed=${body.includes('AA\u00f7')})`);
    } catch (e) {
        console.warn('[soccerway] fetch error:', e.message);
    }

    return res.status(502).json({
        error: 'soccerway_unreachable',
        detail: 'The Soccerway page could not be fetched (blocked or no match feed found). Open the results page on soccerway.com in your browser, select the results and paste them manually — the paste box works exactly the same.',
    });
}
