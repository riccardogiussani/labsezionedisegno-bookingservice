import { Buffer } from 'node:buffer';
import ical from 'node-ical';
import { DateTime } from 'luxon';

export const timeZone = 'Europe/Rome';
const refreshInterval = 60_000;
const maxFeedBytes = 7.5 * 1024 * 1024;

export function createCalendarReader(value, storage) {
  const url = URL.parse(value?.trim() ?? '');
  if (url?.protocol !== 'https:') return null;

  let snapshot;
  let inFlight;
  let lastAttempt = storage?.kv.get('lastAttempt') ?? 0;

  async function refresh() {
    // Persist the reservation before contacting Outlook so a restart cannot repeat it.
    if (storage) {
      storage.kv.put('lastAttempt', lastAttempt);
      await storage.sync();
    }
    const source = await fetchCalendar(url);
    const events = parseCalendar(source);
    const fetchedAt = new Date().toISOString();
    if (storage) storage.kv.put('snapshot', { source: new TextEncoder().encode(source), fetchedAt });
    snapshot = { events, fetchedAt };
  }

  return async function readCalendar() {
    const now = Date.now();
    if (!inFlight && now - lastAttempt >= refreshInterval) {
      lastAttempt = now;
      inFlight = refresh()
        .catch(() => { /* Keep the most recent successful read. */ })
        .finally(() => { inFlight = undefined; });
    }

    await inFlight;
    if (!snapshot) {
      const saved = storage?.kv.get('snapshot');
      if (saved) snapshot = { events: parseCalendar(new TextDecoder().decode(saved.source)), fetchedAt: saved.fetchedAt };
    }
    if (!snapshot) throw new Error('The calendar is temporarily unavailable.');
    return { ...snapshot, stale: lastAttempt > Date.parse(snapshot.fetchedAt) };
  };
}

async function fetchCalendar(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('Invalid response from Outlook.');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxFeedBytes) throw new Error('The calendar is too large.');
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks).toString('utf8').trim();
  if (!/^BEGIN:VCALENDAR\r?\n/i.test(source) || !/\r?\nEND:VCALENDAR$/i.test(source)) {
    throw new Error('The Outlook link did not return an ICS calendar.');
  }
  return source;
}

function parseCalendar(source) {
  const parsed = ical.sync.parseICS(source);
  return Object.values(parsed).filter((entry) => entry.type === 'VEVENT' && entry.start);
}

export function calendarRange(params) {
  const date = (key) => {
    const value = params.get(key);
    return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')
      ? DateTime.fromISO(value, { zone: timeZone })
      : DateTime.invalid('invalid date parameter');
  };
  const from = date('start');
  const to = date('end');
  return from.isValid && to.isValid && to > from && to <= from.plus({ days: 42 })
    ? { from, to }
    : null;
}

function calendarText(value) {
  return (typeof value === 'string' ? value : value?.val ?? '').trim();
}

function isCanceled(event) {
  return /^(?:canceled|cancelled)$/i.test(calendarText(event.status))
    || /^(?:canceled|cancelled|annullato)\s*:/i.test(calendarText(event.summary));
}

export function eventsInRange(events, from, to) {
  const results = [];
  // The parser uses the runtime's wall clock for date-only and floating values.
  const localDate = (date) => {
    const local = new Date(0);
    local.setFullYear(date.year, date.month - 1, date.day);
    local.setHours(0, 0, 0, 0);
    return local;
  };
  const eventDate = (date, allDay) => DateTime.fromJSDate(date)
    .setZone(timeZone, { keepLocalTime: allDay || !date.tz });
  for (const event of events) {
    if (isCanceled(event)) continue;
    const useLocalRange = !event.start.tz || event.datetype === 'date' || event.start.dateOnly;
    const instances = ical.expandRecurringEvent(event, {
      from: useLocalRange ? localDate(from) : from.toJSDate(),
      to: useLocalRange ? localDate(to) : to.toJSDate(),
      expandOngoing: true,
    });

    for (const instance of instances) {
      if (instance.isOverride && isCanceled(instance.event)) continue;
      const start = eventDate(instance.start, instance.isFullDay);
      const end = eventDate(instance.end, instance.isFullDay);
      if (!start.isValid || !end.isValid || start >= to || end < from) continue;
      if (end.equals(from) && start < from) continue;

      results.push({
        title: calendarText(instance.summary) || 'Busy',
        start: instance.isFullDay ? start.toISODate() : start.toISO(),
        end: instance.isFullDay ? end.toISODate() : end.toISO(),
        allDay: instance.isFullDay,
        extendedProps: { recurring: Boolean(event.rrule) },
      });
    }
  }
  return results;
}

export function demoEvents(from, to) {
  const samples = [
    [0, 9, 120, 'Lab preparation'],
    [0, 14, 120, 'Prototype development'],
    [1, 8, 120, 'XR practice session', 'navy', true],
    [1, 8.5, 240, 'Augmented reality', 'gold'],
    [1, 8, 240, 'Lab activities', 'navy'],
    [1, 14.5, 30, 'Project update'],
    [2, 8, 240, 'Lab practice session', 'navy', true],
    [2, 14, 180, 'Product Digital Twin'],
    [3, 9, 420, 'XR headset testing', 'navy'],
    [3, 10, 120, 'XR class'],
    [4, 10, 90, 'Weekly meeting'],
    [4, 14, 120, 'Activity review'],
  ];
  const monday = from.startOf('week');
  return [
    ...samples.map(([day, hour, minutes, title, color, recurring = false]) => {
      const start = monday.plus({ days: day, minutes: hour * 60 });
      return { title, start: start.toISO(), end: start.plus({ minutes }).toISO(),
        extendedProps: { color, recurring } };
    }),
    { title: 'Scheduled maintenance', start: monday.plus({ days: 4 }).toISODate(),
      end: monday.plus({ days: 5 }).toISODate(), allDay: true },
  ].filter((event) => DateTime.fromISO(event.start, { zone: timeZone }) < to
    && DateTime.fromISO(event.end, { zone: timeZone }) > from);
}
