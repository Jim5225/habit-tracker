import { supabase } from '../supabase.js';
import { format, subDays } from 'date-fns';
import Chart from 'chart.js/auto';

let weeklyChartInstance = null;

export async function renderWeeklyView(container) {
  try {
    const today = new Date();
    const dates = Array.from({length: 7}).map((_, i) => format(subDays(today, 6 - i), 'yyyy-MM-dd'));
    
    const { data: pomoHabits } = await supabase.from('pomo_habits').select('*').order('sort_order');
    const { data: pomoLogs } = await supabase.from('pomo_logs').select('*').in('log_date', dates);
    
    container.innerHTML = `
      <div class="view-container">
        <h1>Weekly Summary</h1>
        <p class="subtitle">Last 7 Days Progress</p>
        
        <div class="card" style="margin-bottom: 24px;">
          <canvas id="weeklyChart" height="100"></canvas>
        </div>

        <div class="grid-3">
          ${pomoHabits.map(habit => {
            const thisWeekLogs = pomoLogs.filter(l => l.habit_id === habit.id);
            const totalThisWeek = thisWeekLogs.reduce((sum, log) => sum + log.completed, 0);
            const percent = Math.min(100, Math.round((totalThisWeek / habit.weekly_target) * 100));
            return `
              <div class="card" style="text-align:center; border-top: 4px solid ${habit.color}">
                <h3>${habit.name}</h3>
                <div style="font-size:24px; font-weight:bold; margin: 12px 0;">${totalThisWeek} / ${habit.weekly_target}</div>
                <p style="color:var(--text-secondary)">${percent}% Weekly Target</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    if (weeklyChartInstance) {
      weeklyChartInstance.destroy();
    }

    const datasets = pomoHabits.map(habit => {
      const data = dates.map(date => {
        const log = pomoLogs.find(l => l.habit_id === habit.id && l.log_date === date);
        return log ? log.completed : 0;
      });
      return {
        label: habit.name,
        data: data,
        backgroundColor: habit.color,
      };
    });

    weeklyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates.map(d => format(new Date(d), 'EEE, MMM d')),
        datasets: datasets
      },
      options: {
        responsive: true,
        scales: {
          x: { 
            stacked: true,
            ticks: { color: '#9ca3af' }
          },
          y: { 
            stacked: true,
            ticks: { color: '#9ca3af' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#f3f4f6' }
          }
        }
      }
    });

  } catch (error) {
    console.error("Error loading weekly view:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
