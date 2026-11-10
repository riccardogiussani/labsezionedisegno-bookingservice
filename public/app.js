const zone = 'Europe/Rome';
const locale = 'en-GB';
const apiOrigin = document.querySelector('meta[name="calendar-api-origin"]').content;
const apiEndpoint = apiOrigin ? new URL('/api/events', apiOrigin).href : 'api/events';
const mobile = matchMedia('(max-width: 700px)');
const status = document.querySelector('#status');
const period = document.querySelector('#period');
const details = document.querySelector('#details');
const hour = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short' });
const dayNumber = new Intl.DateTimeFormat(locale, { timeZone: zone, day: '2-digit' });
const date = new Intl.DateTimeFormat(locale, { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' });
const dateAndTime = new Intl.DateTimeFormat(locale, {
  timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
let latestRequest = 0;

function showDetails(event) {
  document.querySelector('#event-title').textContent = event.title;
  const end = event.end ?? event.start;
  const time = event.allDay
    ? `All day · ${date.formatRange(event.start, new Date(Math.max(event.start, end - 1)))}`
    : dateAndTime.formatRange(event.start, end);
  document.querySelector('#event-time').textContent = time;
  details.showModal();
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

const calendar = new FullCalendar.Calendar(document.querySelector('#calendar'), {
  initialView: mobile.matches ? 'timeGridDay' : 'timeGridWeek',
  headerToolbar: false,
  locale: 'en',
  timeZone: zone,
  firstDay: 1,
  height: '100%',
  nowIndicator: true,
  scrollTime: '08:00:00',
  slotDuration: '00:30:00',
  slotLabelInterval: '01:00:00',
  slotLabelFormat: { hour: 'numeric', hour12: false, omitZeroMinute: true },
  slotEventOverlap: false,
  allDayText: 'All day',
  eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  displayEventEnd: true,
  datesSet({ view }) {
    period.textContent = date.formatRange(view.currentStart, new Date(view.currentEnd - 1));
  },
  dayHeaderContent({ date: value }) {
    return { domNodes: [
      element('span', 'day-number', dayNumber.format(value)),
      element('span', 'day-name', day.format(value)),
    ] };
  },
  eventClassNames({ event }) {
    const color = event.extendedProps.color;
    return color === 'gold' || color === 'navy' ? [`event-${color}`] : [];
  },
  eventContent({ event, timeText }) {
    const card = element('div', 'event-card', '');
    card.append(element('span', 'event-title', event.title));
    if (timeText && !event.allDay) card.append(element('span', 'event-time', timeText));
    if (event.extendedProps.recurring) {
      const repeat = element('span', 'repeat', '↻');
      repeat.setAttribute('aria-label', 'Recurring');
      card.append(repeat);
    }
    return { domNodes: [card] };
  },
  eventDidMount({ el, event }) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', (key) => {
      if (key.key === 'Enter' || key.key === ' ') {
        key.preventDefault();
        showDetails(event);
      }
    });
  },
  eventClick: ({ event }) => showDetails(event),
  async events({ startStr, endStr }) {
    const requestId = ++latestRequest;
    status.dataset.state = 'loading';
    status.textContent = 'Loading…';
    try {
      const params = new URLSearchParams({ start: startStr.slice(0, 10), end: endStr.slice(0, 10) });
      const response = await fetch(`${apiEndpoint}?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Calendar unavailable.');
      if (requestId === latestRequest) {
        status.dataset.state = data.stale ? 'stale' : 'ready';
        status.textContent = data.demo ? 'Sample data'
          : `${data.stale ? 'Last available copy · ' : 'Updated at '}${hour.format(new Date(data.fetchedAt))}`;
      }
      return data.events;
    } catch (error) {
      if (requestId === latestRequest) {
        status.dataset.state = 'error';
        status.textContent = error instanceof TypeError ? 'Could not reach the calendar.' : error.message;
      }
      return [];
    }
  },
});

calendar.render();
document.querySelector('#today').addEventListener('click', () => {
  calendar.today();
  calendar.scrollToTime('08:00:00');
});
document.querySelector('#prev').addEventListener('click', () => calendar.prev());
document.querySelector('#next').addEventListener('click', () => calendar.next());
document.querySelector('#refresh').addEventListener('click', () => calendar.refetchEvents());
mobile.addEventListener('change', ({ matches }) => calendar.changeView(matches ? 'timeGridDay' : 'timeGridWeek'));
