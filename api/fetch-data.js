/*
 * Vercel Serverless Function — Proxies football-data.co.uk CSV requests
 * Avoids CORS by fetching server-side (same pattern as original techmari Next.js app)
 */

export const config = {
  runtime: 'nodejs',
};

// Rate-limit: min 500ms between requests to football-data.co.uk
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { league, season } = req.query;

  if (!league || !season) {
    return res.status(400).json({ error: 'Missing league or season parameter' });
  }

  // Validate league code (alphanumeric only, max 4 chars)
  if (!/^[A-Z0-9]{1,4}$/i.test(league)) {
    return res.status(400).json({ error: 'Invalid league code' });
  }

  // Validate season code (4 digits)
  if (!/^\d{4}$/.test(season)) {
    return res.status(400).json({ error: 'Invalid season code' });
  }

  const url = `https://www.football-data.co.uk/mmz4281/${season}/${league}.csv`;

  // Enforce rate limiting
  const timeSinceLastRequest = Date.now() - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Fetch with retry (up to 3 attempts)
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/csv,text/plain,*/*',
        },
      });

      if (response.status === 429) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        await delay(waitTime);
        continue;
      }

      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: `Upstream returned ${response.status}` });
      }

      const text = await response.text();

      // Validate it's actual CSV data
      if (!text || !text.includes('HomeTeam')) {
        return res.status(502).json({ error: 'Invalid CSV data from upstream' });
      }

      // Return as CSV with proper headers
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
      return res.status(200).send(text);
    } catch (error) {
      console.error(`[fetch-data] Attempt ${attempt + 1} failed:`, error.message);
      if (attempt === maxRetries - 1) {
        return res.status(502).json({
          error: 'Failed to fetch from football-data.co.uk after retries',
        });
      }
      await delay(1000 * Math.pow(2, attempt));
    }
  }

  return res.status(502).json({ error: 'All retry attempts failed' });
}