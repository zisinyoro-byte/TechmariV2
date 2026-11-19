/*
 * Vercel Serverless Function — fetches a SoccerSTATS.com page server-side
 * (CORS bypass) and returns the HTML so the browser can extract the
 * First Half tables (overall / AT HOME / AWAY).
 *
 * soccerstats.com sits behind Cloudflare, which blocks many datacenter IPs.
 * Strategy:
 *   1. Try a direct fetch with browser-like headers.
 *   2. If blocked (403/429/503 or a Cloudflare challenge/block page), retry
 *      through the r.jina.ai reader, which renders the page from its own
 *      infrastructure and returns HTML (X-Return-Format: html).
 *      NOTE: since Nov 2026 jina rejects ANONYMOUS queries from datacenter IPs
 *      (401 "bad IP reputation") — set JINA_API_KEY in the Vercel env vars for
 *      the reader path to work at all.
 *   3. If both fail, return 502 — the app falls back to the manual paste box.
 *
 * Politeness: responses are cached at the edge for 10 min (stale-while-revalidate
 * 1h — league tables update after every round, so caches stay short) and
 * upstream requests are paced >= 1.2s apart.
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
    return /Attention Required|Just a moment|cf-error-details|challenge-platform|Enable JavaScript and cookies/i.test(head);
}

// Drop scripts/styles/comments: the FH tables are pure markup, and this
// roughly halves the payload sent to the browser.
function slimHtml(html) {
    return String(html || '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
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
    if (!parsed || parsed.protocol !== 'https:' || !/(^|\.)soccerstats\.com$/i.test(parsed.hostname)) {
        return res.status(400).json({ error: 'Invalid url parameter — must be an https soccerstats.com page URL' });
    }

    // Pace upstream requests (best effort; module state is per-lambda-instance).
    const since = Date.now() - lastRequestTime;
    if (since < MIN_REQUEST_INTERVAL) await delay(MIN_REQUEST_INTERVAL - since);
    lastRequestTime = Date.now();

    // Track upstream outcomes so the 502 can say which leg failed and why.
    let directStatus = 'network-error';
    let readerStatus = 'network-error';
    let readerAuthBlocked = false;

    // 1) Direct fetch
    try {
        const r = await fetchWithTimeout(parsed.href, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-GB,en;q=0.9',
            },
        });
        directStatus = r.status;
        const body = await r.text();
        if (r.ok && !isBlocked(r.status, body) && /<table/i.test(body)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Soccerstats-Via', 'direct');
            res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
            return res.status(200).send(slimHtml(body));
        }
        console.warn(`[soccerstats] direct fetch unusable (status=${r.status}, blocked=${isBlocked(r.status, body)})`);
    } catch (e) {
        console.warn('[soccerstats] direct fetch error:', e.message);
    }

    // 2) Reader fallback (r.jina.ai renders the page and returns HTML)
    try {
        const headers = { 'X-Return-Format': 'html', Accept: 'text/html' };
        if (process.env.JINA_API_KEY) headers.Authorization = 'Bearer ' + process.env.JINA_API_KEY;
        const r = await fetchWithTimeout('https://r.jina.ai/' + encodeURIComponent(parsed.href), { headers }, 30000);
        readerStatus = r.status;
        const body = await r.text();
        // jina now hard-blocks anonymous queries from datacenter IPs with a 401
        // ("bad IP reputation ... Please authenticate") — only a key fixes that.
        readerAuthBlocked = /AuthenticationRequiredError|bad IP reputation|Please authenticate/i.test(body.slice(0, 1000));
        if (r.ok && !isBlocked(r.status, body) && /<table/i.test(body)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Soccerstats-Via', 'reader');
            res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
            return res.status(200).send(slimHtml(body));
        }
        console.warn(`[soccerstats] reader fallback unusable (status=${r.status})`);
    } catch (e) {
        console.warn('[soccerstats] reader fallback error:', e.message);
    }

    const legs = `direct=${directStatus}, reader=${readerStatus}${readerAuthBlocked ? ' (auth required)' : ''}`;
    const hint = readerAuthBlocked && !process.env.JINA_API_KEY
        ? ' Hint: the jina.ai reader now rejects anonymous queries from server IPs — set JINA_API_KEY in the Vercel project environment variables and redeploy. Meanwhile, paste the tables manually (the paste box works exactly the same).'
        : ' Open the page on soccerstats.com in your browser and paste the First Half tables manually — the paste box works exactly the same.';
    return res.status(502).json({
        error: 'soccerstats_unreachable',
        detail: `Both the direct fetch and the reader fallback failed (${legs}).${hint}`,
    });
}
