import { supabase } from '../supabase.js';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';

export async function renderDailyView(container) {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Set default prep dates if they don't exist
  if (!localStorage.getItem('prep_start_date')) {
    localStorage.setItem('prep_start_date', today);
  }
  if (!localStorage.getItem('prep_end_date')) {
    localStorage.setItem('prep_end_date', '2026-12-31');
  }

  const prepStartDate = localStorage.getItem('prep_start_date');
  const prepEndDate = localStorage.getItem('prep_end_date');

  // Calculate countdown metrics
  const todayDate = new Date();
  const startDate = parseISO(prepStartDate);
  const endDate = parseISO(prepEndDate);

  const totalDays = Math.max(1, differenceInCalendarDays(endDate, startDate));
  const daysElapsed = Math.max(0, differenceInCalendarDays(todayDate, startDate));
  const daysRemaining = Math.max(0, differenceInCalendarDays(endDate, todayDate));
  const percentElapsed = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

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
        
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px;">
          <div>
            <h1>Today's Progress</h1>
            <p class="subtitle" style="margin-bottom:0;">${format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
          </div>
        </div>

        <!-- Preparation Countdown Widget -->
        <div class="card" style="margin-bottom: 32px; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin-bottom: 0;">🎯 Preparation Countdown</h3>
            <button id="btn-prep-toggle" style="padding: 4px 12px; font-size: 12px; background: rgba(255,255,255,0.08);">
              ${window.showPrepSettings ? 'Cancel' : 'Reset Target'}
            </button>
          </div>
          
          ${window.showPrepSettings ? `
            <div style="margin-top: 16px; display: flex; gap: 12px; align-items: flex-end; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
              <div class="input-group" style="margin-bottom: 0; flex: 1;">
                <label style="font-size:12px; margin-bottom: 4px;">Start Date</label>
                <input type="date" id="prep-start-input" value="${prepStartDate}" style="padding: 6px; font-size: 14px; width: 100%;">
              </div>
              <div class="input-group" style="margin-bottom: 0; flex: 1;">
                <label style="font-size:12px; margin-bottom: 4px;">End Date</label>
                <input type="date" id="prep-end-input" value="${prepEndDate}" style="padding: 6px; font-size: 14px; width: 100%;">
              </div>
              <button id="btn-prep-save" style="padding: 8px 16px; font-size: 14px; background: var(--accent-cyan);">Save</button>
            </div>
          ` : `
            <div style="margin-top: 16px;">
              <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px;">
                <span><strong>${daysRemaining}</strong> days left</span>
                <span style="color: var(--text-secondary);">${percentElapsed}% elapsed (${daysElapsed}/${totalDays} days)</span>
              </div>
              <div class="budget-progress-container" style="margin: 0; height: 12px; background: rgba(255, 255, 255, 0.05);">
                <div class="budget-progress-bar safe" style="width: ${percentElapsed}%;"></div>
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px; text-align: right;">
                Target: ${format(parseISO(prepEndDate), 'MMMM d, yyyy')}
              </div>
            </div>
          `}
        </div>
        
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

    // Hook up button events
    document.getElementById('btn-prep-toggle').addEventListener('click', () => {
      window.showPrepSettings = !window.showPrepSettings;
      renderDailyView(container);
    });

    if (window.showPrepSettings) {
      document.getElementById('btn-prep-save').addEventListener('click', () => {
        const start = document.getElementById('prep-start-input').value;
        const end = document.getElementById('prep-end-input').value;
        if (start && end) {
          localStorage.setItem('prep_start_date', start);
          localStorage.setItem('prep_end_date', end);
          window.showPrepSettings = false;
          renderDailyView(container);
        }
      });
    }

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
