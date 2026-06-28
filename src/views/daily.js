import { supabase } from '../supabase.js';
import { format } from 'date-fns';

export async function renderDailyView(container) {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  try {
    const { data: pomoHabits } = await supabase.from('pomo_habits').select('*').order('sort_order');
    const { data: pomoLogs } = await supabase.from('pomo_logs').select('*').eq('log_date', today);
    const { data: checkHabits } = await supabase.from('checkbox_habits').select('*').eq('is_active', true).order('sort_order');
    const { data: checkLogs } = await supabase.from('checkbox_logs').select('*').eq('log_date', today);

    let allTargetsMet = true;

    let pomoHtml = pomoHabits.map(habit => {
      const log = pomoLogs?.find(l => l.habit_id === habit.id) || { completed: 0 };
      const percent = Math.min(100, Math.round((log.completed / habit.daily_target) * 100));
      
      const isExcellent = log.completed >= habit.daily_target;
      if (!isExcellent) allTargetsMet = false;
      
      return `
        <div class="card ${isExcellent ? 'card-glow' : ''}" style="text-align:center; border-top: 4px solid ${habit.color}; position:relative; overflow:hidden;">
          <h3>${habit.name}</h3>
          <div style="font-size:32px; font-weight:bold; margin: 16px 0;">${log.completed} / ${habit.daily_target}</div>
          <p style="color:var(--text-secondary); margin-bottom:16px;">${percent}% Daily Target</p>
          
          ${isExcellent ? `<div class="badge-excellent">Excellent! 🎉</div>` : ''}
          
          <div class="input-group" style="margin-top: ${isExcellent ? '16px' : '0'};">
            <div style="display:flex; gap:8px; justify-content:center;">
              <button onclick="updatePomo('${habit.id}', ${log.completed - 1})" ${log.completed <= 0 ? 'disabled' : ''}>-</button>
              <input type="number" id="pomo-${habit.id}" value="1" min="1" max="10" style="width:60px; text-align:center;">
              <button onclick="updatePomo('${habit.id}', ${log.completed} + parseInt(document.getElementById('pomo-${habit.id}').value))">+</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    let checkHtml = checkHabits.map(habit => {
      const log = checkLogs?.find(l => l.habit_id === habit.id) || { completed: false, value: 0 };
      const hasValueInput = habit.unit !== null;
      
      if (!log.completed) allTargetsMet = false; 
      
      return `
        <div class="checkbox-item" onclick="if(event.target.tagName !== 'INPUT') document.getElementById('chk-${habit.id}').click()">
          <input type="checkbox" id="chk-${habit.id}" ${log.completed ? 'checked' : ''} onchange="updateCheck('${habit.id}', this.checked, document.getElementById('val-${habit.id}')?.value)">
          <div class="checkbox-details">
            <div class="checkbox-name">${habit.icon} ${habit.name}</div>
            ${habit.daily_target ? `<div class="checkbox-meta">Target: ${habit.daily_target} ${habit.unit}</div>` : ''}
          </div>
          ${hasValueInput ? `
            <input type="number" id="val-${habit.id}" class="checkbox-value-input" value="${log.value || 0}" 
              placeholder="${habit.unit}" onchange="updateCheck('${habit.id}', document.getElementById('chk-${habit.id}').checked, this.value)"
              onclick="event.stopPropagation()">
            <span style="font-size:12px; color:var(--text-secondary);">${habit.unit}</span>
          ` : ''}
        </div>
      `;
    }).join('');

    const isFlawless = pomoHabits.length > 0 && allTargetsMet;

    container.innerHTML = `
      <div class="view-container">
        ${isFlawless ? `<div class="banner-flawless">Flawless Victory 🏆<br><span style="font-size:16px; font-weight:normal;">You hit all your targets for today!</span></div>` : ''}
        
        <h1>Today's Progress</h1>
        <p class="subtitle">${format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        
        <h2>Pomodoro Habits</h2>
        <div class="grid-3" style="margin-bottom: 40px;">
          ${pomoHtml}
        </div>

        <h2>Daily Checkboxes</h2>
        <div style="display:flex; flex-direction:column; gap:12px; max-width:600px;">
          ${checkHtml}
        </div>
      </div>
    `;

    window.updatePomo = async (habitId, newValue) => {
      if (newValue < 0) newValue = 0;
      await supabase.from('pomo_logs').upsert({
        habit_id: habitId,
        log_date: today,
        completed: newValue
      }, { onConflict: 'habit_id,log_date' });
      renderDailyView(container);
    };

    window.updateCheck = async (habitId, isChecked, value) => {
      await supabase.from('checkbox_logs').upsert({
        habit_id: habitId,
        log_date: today,
        completed: isChecked,
        value: value ? parseFloat(value) : null
      }, { onConflict: 'habit_id,log_date' });
      renderDailyView(container);
    };

  } catch (error) {
    console.error("Error loading daily view:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
