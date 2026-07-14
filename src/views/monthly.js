import { supabase } from '../supabase.js';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Chart from 'chart.js/auto';

let monthlyChartInstance = null;

export async function renderMonthlyView(container) {
  try {
    const today = new Date();
    const start = format(startOfMonth(today), 'yyyy-MM-dd');
    const end = format(endOfMonth(today), 'yyyy-MM-dd');
    
    const { data: pomoHabits } = await supabase.from('pomo_habits').select('*').order('sort_order');
    const { data: pomoLogs } = await supabase.from('pomo_logs').select('*').gte('log_date', start).lte('log_date', end);
    
    container.innerHTML = `
      <div class="view-container">
        <h1>Monthly Overview</h1>
        <p class="subtitle">${format(today, 'MMMM yyyy')}</p>
        
        <div class="card" style="margin-bottom: 24px;">
          <canvas id="monthlyChart" height="100"></canvas>
        </div>

        <div class="grid-3">
          ${pomoHabits.map(habit => {
            const thisMonthLogs = pomoLogs.filter(l => l.habit_id === habit.id);
            const totalThisMonth = thisMonthLogs.reduce((sum, log) => sum + log.completed, 0);
            const percent = Math.min(100, Math.round((totalThisMonth / habit.monthly_target) * 100));
            return `
              <div class="card" style="text-align:center; border-top: 4px solid ${habit.color}">
                <h3>${habit.name}</h3>
                <div style="font-size:24px; font-weight:bold; margin: 12px 0;">${totalThisMonth} / ${habit.monthly_target}</div>
                <p style="color:var(--text-secondary)">${percent}% Monthly Target</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    if (monthlyChartInstance) {
      monthlyChartInstance.destroy();
    }
    
    let dates = [...new Set(pomoLogs.map(l => l.log_date))].sort();
    if (dates.length === 0) dates = [format(today, 'yyyy-MM-dd')];

    const datasets = pomoHabits.map(habit => {
      const data = dates.map(date => {
        const log = pomoLogs.find(l => l.habit_id === habit.id && l.log_date === date);
        return log ? log.completed : 0;
      });
      return {
        label: habit.name,
        data: data,
        borderColor: habit.color,
        backgroundColor: habit.color + '33', // with transparency
        tension: 0.3,
        fill: true
      };
    });

    monthlyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(d => format(new Date(d), 'MMM d')),
        datasets: datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { color: '#0f172a' }
          }
        },
        scales: {
          x: { 
            ticks: { color: '#64748b' },
            grid: { color: '#e2e8f0' }
          },
          y: { 
            ticks: { color: '#64748b' },
            grid: { color: '#e2e8f0' }
          }
        }
      }
    });

  } catch (error) {
    console.error("Error loading monthly view:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
