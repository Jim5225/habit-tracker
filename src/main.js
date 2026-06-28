import './style.css';
import { renderDailyView } from './views/daily.js';
import { renderWeeklyView } from './views/weekly.js';
import { renderMonthlyView } from './views/monthly.js';
import { renderAnalyticsView } from './views/analytics.js';
import { renderCalendarView } from './views/calendar.js';

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

document.addEventListener('DOMContentLoaded', () => {
  loadView('daily');
});
