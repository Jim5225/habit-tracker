import './style.css';
import { renderDailyView } from './views/daily.js';
import { renderWeeklyView } from './views/weekly.js';
import { renderMonthlyView } from './views/monthly.js';
import { renderAnalyticsView } from './views/analytics.js';
import { renderCalendarView } from './views/calendar.js';
import { renderBudgetView } from './views/budget.js';
import { renderFollowUpView } from './views/followup.js';
import { renderTodoView } from './views/todo.js';

const app = document.getElementById('app-view');
const navLinks = document.querySelectorAll('.nav-links a');

function loadView(view) {
  app.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;">Loading...</div>';
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.dataset.view === view) {
      link.classList.add('active');
    }
  });

  switch(view) {
    case 'daily':
      renderDailyView(app);
      break;
    case 'weekly':
      renderWeeklyView(app);
      break;
    case 'monthly':
      renderMonthlyView(app);
      break;
    case 'analytics':
      renderAnalyticsView(app);
      break;
    case 'calendar':
      renderCalendarView(app);
      break;
    case 'budget':
      renderBudgetView(app);
      break;
    case 'followup':
      renderFollowUpView(app);
      break;
    case 'todo':
      renderTodoView(app);
      break;
    default:
      renderDailyView(app);
  }
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = e.currentTarget.dataset.view;
    loadView(view);
  });
});

async function checkOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    const clientId = localStorage.getItem('ticktick_client_id');
    const clientSecret = localStorage.getItem('ticktick_client_secret');
    const redirectUri = localStorage.getItem('ticktick_redirect_uri');

    if (clientId && clientSecret && redirectUri) {
      app.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;">Authenticating with TickTick...</div>';
      try {
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        });

        const response = await fetch('https://corsproxy.io/?https://ticktick.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });

        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('ticktick_access_token', data.access_token);
        } else {
          console.error("Token exchange failed:", await response.text());
        }
      } catch (err) {
        console.error("Error during token exchange:", err);
      }
    }
    
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({path: newUrl}, '', newUrl);
    loadView('todo');
  } else {
    loadView('daily');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkOAuthCallback();
});
