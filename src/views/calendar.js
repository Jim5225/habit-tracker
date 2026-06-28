import { format, startOfWeek, addDays, parseISO } from 'date-fns';

let tokenClient = null;
let accessToken = localStorage.getItem('gcal_access_token') || null;

export async function renderCalendarView(container) {
  const storedClientId = localStorage.getItem('gcal_client_id') || '';
  const storedApiKey = localStorage.getItem('gcal_api_key') || '';

  function saveConfig() {
    const clientId = document.getElementById('client-id').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    localStorage.setItem('gcal_client_id', clientId);
    localStorage.setItem('gcal_api_key', apiKey);
    renderCalendarView(container);
  }

  function handleAuth() {
    const clientId = localStorage.getItem('gcal_client_id');
    if (!clientId) {
      alert("Please enter a Google Client ID first.");
      return;
    }

    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
        callback: async (response) => {
          if (response.error !== undefined) {
            throw (response);
          }
          accessToken = response.access_token;
          localStorage.setItem('gcal_access_token', accessToken);
          renderCalendarView(container);
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  function handleSignout() {
    const token = localStorage.getItem('gcal_access_token');
    if (token !== null) {
      google.accounts.oauth2.revokeToken(token);
      localStorage.removeItem('gcal_access_token');
      accessToken = null;
      renderCalendarView(container);
    }
  }

  async function fetchEvents() {
    if (!accessToken) return [];
    const apiKey = localStorage.getItem('gcal_api_key');
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const end = addDays(start, 7);

    const timeMin = start.toISOString();
    const timeMax = end.toISOString();

    let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    if (apiKey) {
      url += `&key=${apiKey}`;
    }

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('gcal_access_token');
          accessToken = null;
        }
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      return data.items || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  const events = accessToken ? await fetchEvents() : [];
  const today = new Date();
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));

  const startHour = 8;
  const endHour = 22;
  const totalSlots = endHour - startHour + 1;

  const dayHeadersHtml = weekDays.map(day => `
    <div class="day-header">
      <div>${format(day, 'EEE')}</div>
      <div style="font-size: 11px; color: var(--text-secondary);">${format(day, 'MMM d')}</div>
    </div>
  `).join('');

  const dayColumnsHtml = weekDays.map((day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayEvents = events.filter(event => {
      const startDateTime = event.start.dateTime || event.start.date;
      return startDateTime.startsWith(dayStr);
    });

    const eventBlocksHtml = dayEvents.map(event => {
      if (!event.start.dateTime) return ''; 

      const start = parseISO(event.start.dateTime);
      const end = parseISO(event.end.dateTime);

      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();

      const calendarStartMin = startHour * 60;
      const calendarEndMin = (endHour + 1) * 60;

      if (startMin >= calendarEndMin || endMin <= calendarStartMin) return '';

      const offsetMin = Math.max(0, startMin - calendarStartMin);
      const durationMin = Math.min(calendarEndMin - calendarStartMin, endMin - calendarStartMin) - offsetMin;

      const top = (offsetMin / 60) * 40; 
      const height = (durationMin / 60) * 40;

      return `
        <div class="calendar-event" style="top: ${top}px; height: ${height}px;" title="${event.summary}">
          <strong>${format(start, 'h:mm a')}</strong><br>${event.summary}
        </div>
      `;
    }).join('');

    const hourCellsHtml = Array.from({ length: totalSlots }).map(() => `<div class="hour-cell"></div>`).join('');

    return `
      <div class="calendar-day-column">
        ${eventBlocksHtml}
        ${hourCellsHtml}
      </div>
    `;
  }).join('');

  const timeAxisHtml = Array.from({ length: totalSlots }).map((_, i) => {
    const hour = startHour + i;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `<div class="time-slot-label">${displayHour}:00 ${ampm}</div>`;
  }).join('');

  container.innerHTML = `
    <div class="view-container">
      <h1>Weekly Schedule & Timeblocks</h1>
      <p class="subtitle">Sync your Google Calendar to visualize your commitments</p>

      <div class="card" style="margin-bottom: 24px;">
        <h2>Google Calendar Configuration</h2>
        <div class="settings-grid">
          <div class="input-group">
            <label for="client-id">Google OAuth Client ID</label>
            <input type="text" id="client-id" value="${storedClientId}" placeholder="Enter OAuth Client ID">
          </div>
          <div class="input-group">
            <label for="api-key">Google API Key (Optional)</label>
            <input type="text" id="api-key" value="${storedApiKey}" placeholder="Enter Google API Key">
          </div>
        </div>
        <div style="display:flex; gap:12px;">
          <button id="btn-save-config">Save Credentials</button>
          ${accessToken ? 
            `<button id="btn-signout" style="background: var(--accent-red);">Disconnect Calendar</button>` :
            `<button id="btn-auth" class="btn-google">Connect Google Calendar</button>`
          }
        </div>
      </div>

      ${accessToken ? `
        <div class="calendar-layout">
          <div class="time-axis">
            ${timeAxisHtml}
          </div>
          <div style="display: flex; flex-direction: column; overflow: hidden; flex: 1;">
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid var(--border-color);">
              ${dayHeadersHtml}
            </div>
            <div class="calendar-grid-content">
              ${dayColumnsHtml}
            </div>
          </div>
        </div>
      ` : `
        <div class="card" style="text-align: center; padding: 40px;">
          <h3>Google Calendar Not Connected</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">Connect your account above to import your events and structure your day.</p>
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  if (accessToken) {
    document.getElementById('btn-signout').addEventListener('click', handleSignout);
  } else {
    document.getElementById('btn-auth').addEventListener('click', handleAuth);
  }
}
