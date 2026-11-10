import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { calendarRange, createCalendarReader, demoEvents, eventsInRange, timeZone } from './calendar.mjs';
import { frontendAssets } from './frontend-assets.mjs';

process.env.TZ = timeZone;

const demo = process.argv.includes('--demo');
const reader = createCalendarReader(process.env.OUTLOOK_ICS_URL);

function send(response, status, body, type = 'application/json') {
  response.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  response.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(response, 405, { error: 'Method not allowed.' });
    }

    const { pathname, searchParams } = new URL(request.url, 'http://localhost');
    if (pathname === '/api/events') {
      const range = calendarRange(searchParams);
      if (!range) {
        return send(response, 400, { error: 'Invalid date range.' });
      }
      const { from, to } = range;
      if (demo) return send(response, 200, { demo: true, events: demoEvents(from, to) });
      if (!reader) {
        return send(response, 503, { error: 'The Outlook calendar must be configured.' });
      }

      const { events, fetchedAt, stale } = await reader();
      return send(response, 200, { events: eventsInRange(events, from, to), fetchedAt, stale });
    }

    const asset = frontendAssets.get(pathname === '/' ? '/index.html' : pathname);
    if (!asset) return send(response, 404, { error: 'Page not found.' });
    const [file, contentType] = asset;
    return send(response, 200, await readFile(new URL(file, import.meta.url)), contentType);
  } catch {
    return send(response, 503, { error: 'The calendar is temporarily unavailable. Try again in a minute.' });
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Lab Calendar → http://${host}:${server.address().port}${demo ? ' (demo)' : ''}`);
});
