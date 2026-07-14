import { supabase } from '../supabase.js';
import { format, subDays } from 'date-fns';
import Chart from 'chart.js/auto';

let charts = [];

export async function renderAnalyticsView(container) {
  try {
    const today = new Date();
    const past30Days = Array.from({length: 30}).map((_, i) => format(subDays(today, 29 - i), 'yyyy-MM-dd'));
    
    const { data: pomoHabits } = await supabase.from('pomo_habits').select('*').order('sort_order');
    const { data: pomoLogs } = await supabase.from('pomo_logs').select('*').in('log_date', past30Days);

    let recommendationsHTML = '';
    const last7Days = past30Days.slice(-7);
    
    pomoHabits.forEach(habit => {
      const logsLast7Days = pomoLogs.filter(l => l.habit_id === habit.id && last7Days.includes(l.log_date));
      const totalLast7Days = logsLast7Days.reduce((sum, log) => sum + log.completed, 0);
      const target = habit.weekly_target;
      
      if (totalLast7Days < target) {
        const shortfall = target - totalLast7Days;
        const dailyExtra = Math.ceil(shortfall / 7);
        recommendationsHTML += `
          <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--accent-red); padding: 12px; margin-bottom: 12px; border-radius: 4px;">
            <strong>${habit.name} Needs Attention:</strong> You missed your weekly target by ${shortfall} pomodoros. 
            Try adding <strong>${dailyExtra} extra pomodoro(s) per day</strong> next week to catch up!
          </div>
        `;
      } else {
        recommendationsHTML += `
          <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--accent-green); padding: 12px; margin-bottom: 12px; border-radius: 4px;">
            <strong>${habit.name} Mastered:</strong> You crushed your weekly target (${totalLast7Days}/${target}). Keep up the momentum! 🎉
          </div>
        `;
      }
    });

    container.innerHTML = `
      <div class="view-container">
        <h1>Advanced Analytics</h1>
        <p class="subtitle">Insights into your progress and failures</p>
        
        <div class="card" style="margin-bottom: 24px;">
          <h2>Insights & Recommendations</h2>
          ${recommendationsHTML}
        </div>

        <div class="grid-2" style="margin-bottom: 24px;">
          <div class="card">
            <h2>Effort Distribution (30 Days)</h2>
            <div style="max-height: 300px; display:flex; justify-content:center;">
              <canvas id="pieChart"></canvas>
            </div>
          </div>
          <div class="card">
            <h2>Success vs Missed (7 Days)</h2>
            <div style="max-height: 300px; display:flex; justify-content:center;">
              <canvas id="barChart"></canvas>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Progress Trend (14 Days)</h2>
          <canvas id="lineChart" height="80"></canvas>
        </div>
      </div>
    `;

    charts.forEach(c => c.destroy());
    charts = [];

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const pieData = pomoHabits.map(habit => {
      return pomoLogs.filter(l => l.habit_id === habit.id).reduce((sum, l) => sum + l.completed, 0);
    });
    charts.push(new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: pomoHabits.map(h => h.name),
        datasets: [{
          data: pieData,
          backgroundColor: pomoHabits.map(h => h.color),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#0f172a' } } }
      }
    }));

    const barCtx = document.getElementById('barChart').getContext('2d');
    const barLabels = pomoHabits.map(h => h.name);
    const barCompleted = pomoHabits.map(h => {
      const logs = pomoLogs.filter(l => l.habit_id === h.id && last7Days.includes(l.log_date));
      return logs.reduce((sum, l) => sum + l.completed, 0);
    });
    const barTargets = pomoHabits.map(h => h.weekly_target);
    const barMissed = barCompleted.map((c, i) => Math.max(0, barTargets[i] - c));

    charts.push(new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [
          { label: 'Completed', data: barCompleted, backgroundColor: '#10b981' },
          { label: 'Missed', data: barMissed, backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
          y: { stacked: true, ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } }
        },
        plugins: { legend: { labels: { color: '#0f172a' } } }
      }
    }));

    const lineCtx = document.getElementById('lineChart').getContext('2d');
    const last14Days = past30Days.slice(-14);
    
    const totalDailyTarget = pomoHabits.reduce((sum, h) => sum + h.daily_target, 0);
    const lineData = last14Days.map(date => {
      const dayLogs = pomoLogs.filter(l => l.log_date === date);
      const dayTotal = dayLogs.reduce((sum, l) => sum + l.completed, 0);
      return Math.min(100, Math.round((dayTotal / (totalDailyTarget || 1)) * 100));
    });

    charts.push(new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: last14Days.map(d => format(new Date(d), 'MMM d')),
        datasets: [{
          label: 'Daily Completion %',
          data: lineData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' }, min: 0, max: 100 }
        },
        plugins: { legend: { labels: { color: '#0f172a' } } }
      }
    }));

  } catch (error) {
    console.error("Error loading analytics:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
