import { DurableObject } from 'cloudflare:workers';
import { calendarRange, createCalendarReader, eventsInRange } from '../calendar.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
    if (origin && !allowed.includes(origin)) return json({ error: 'Origine non autorizzata.' }, 403);

    let response;
    if (new URL(request.url).pathname !== '/api/events') {
      response = json({ error: 'Pagina non trovata.' }, 404);
    } else if (request.method !== 'GET') {
      response = json({ error: 'Metodo non consentito.' }, 405);
      response.headers.set('Allow', 'GET');
    } else {
      try {
        const calendar = env.CALENDAR.getByName('lab-calendar');
        const result = await calendar.fetch(request);
        response = new Response(result.body, result);
      } catch {
        response = json({ error: 'Calendario temporaneamente non disponibile.' }, 503);
      }
    }

    response.headers.set('Vary', 'Origin');
    if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
    return response;
  },
};

export class LabCalendar extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.readCalendar = createCalendarReader(env.OUTLOOK_ICS_URL, ctx.storage);
  }

  async fetch(request) {
    const range = calendarRange(new URL(request.url).searchParams);
    if (!range) return json({ error: 'Intervallo di date non valido.' }, 400);
    if (!this.readCalendar) return json({ error: 'Il calendario Outlook deve essere configurato.' }, 503);

    try {
      const { events, fetchedAt, stale } = await this.readCalendar();
      return json({ events: eventsInRange(events, range.from, range.to), fetchedAt, stale });
    } catch {
      return json({ error: 'Calendario temporaneamente non disponibile. Riprova tra un minuto.' }, 503);
    }
  }
}
