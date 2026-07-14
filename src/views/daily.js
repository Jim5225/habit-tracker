import { supabase } from '../supabase.js';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';

export async function renderDailyView(container) {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  if (!localStorage.getItem('prep_start_date')) {
    localStorage.setItem('prep_start_date', today);
  }
  if (!localStorage.getItem('prep_end_date')) {
    localStorage.setItem('prep_end_date', '2026-12-31');
  }

  const prepStartDate = localStorage.getItem('prep_start_date');
  const prepEndDate = localStorage.getItem('prep_end_date');

  const todayDate = new Date();
  const startDate = parseISO(prepStartDate);
  const endDate = parseISO(prepEndDate);

  const totalDays = Math.max(1, differenceInCalendarDays(endDate, startDate));
  const daysElapsed = Math.max(0, differenceInCalendarDays(todayDate, startDate));
  const daysRemaining = Math.max(0, differenceInCalendarDays(endDate, todayDate));
  const percentElapsed = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

  // --- TIMER STATE INITIALIZATION ---
  let timerState = localStorage.getItem('pomo_state') || 'idle'; // idle, running, paused
  let timerMode = localStorage.getItem('pomo_mode') || 'focus'; // focus, short_break, long_break
  let selectedCategory = localStorage.getItem('pomo_selected_category') || '';
  let duration = getDurationForMode(timerMode); // in ms
  
  // Calculate remaining time
  let remainingTime = duration;
  if (timerState === 'paused') {
    remainingTime = Number(localStorage.getItem('pomo_remaining')) || duration;
  } else if (timerState === 'running') {
    const target = Number(localStorage.getItem('pomo_target_time')) || 0;
    remainingTime = Math.max(0, target - Date.now());
    if (remainingTime <= 0) {
      timerState = 'idle';
      localStorage.setItem('pomo_state', 'idle');
    }
  }

  function getDurationForMode(mode) {
    if (mode === 'focus') return 25 * 60 * 1000;
    if (mode === 'short_break') return 5 * 60 * 1000;
    if (mode === 'long_break') return 15 * 60 * 1000;
    return 25 * 60 * 1000;
  }

  function getModeLabel(mode) {
    if (mode === 'focus') return 'Focus Session';
    if (mode === 'short_break') return 'Short Break';
    if (mode === 'long_break') return 'Long Break';
    return 'Focus';
  }

  function playChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.error("Audio Context failed to play chime:", e);
    }
  }

  function triggerPushNotification(title, message) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }

  try {
    const { data: pomoHabits } = await supabase.from('pomo_habits').select('*').order('sort_order');
    const { data: pomoLogs } = await supabase.from('pomo_logs').select('*').eq('log_date', today);
    const { data: checkHabits } = await supabase.from('checkbox_habits').select('*').eq('is_active', true).order('sort_order');
    const { data: checkLogs } = await supabase.from('checkbox_logs').select('*').eq('log_date', today);
    const { data: localTodoTasks } = await supabase.from('local_todo_tasks').select('*').eq('due_date', today);

    // Default select category
    if (!selectedCategory && pomoHabits.length > 0) {
      selectedCategory = pomoHabits[0].id;
      localStorage.setItem('pomo_selected_category', selectedCategory);
    }

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

    // --- Sort Planner Tasks ---
    const allPlannerTasks = (localTodoTasks || []).map(t => ({ ...t, isTickTick: false }));

    const morningTasks = [];
    const noonTasks = [];
    const nightTasks = [];
    const untimedTasks = [];

    allPlannerTasks.forEach(task => {
      let timeStr = '';
      let hour = -1;

      if (task.task_time) {
        const timeParts = task.task_time.split(':');
        hour = parseInt(timeParts[0]);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        timeStr = `${displayHour}:${timeParts[1]} ${ampm}`;
      }

      const taskWithTimeStr = { ...task, timeDisplay: timeStr };

      if (hour === -1) {
        untimedTasks.push(taskWithTimeStr);
      } else if (hour >= 5 && hour < 12) {
        morningTasks.push(taskWithTimeStr);
      } else if (hour >= 12 && hour < 17) {
        noonTasks.push(taskWithTimeStr);
      } else {
        nightTasks.push(taskWithTimeStr);
      }
    });

    const renderPlannerItem = (t) => `
      <div class="planner-task-item ${t.completed ? 'completed' : ''}">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${t.completed ? 'checked' : ''} 
            onclick="toggleDailyTask('${t.id}', ${!t.completed})">
          <span>${t.title}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${t.timeDisplay ? `<span class="planner-task-time">${t.timeDisplay}</span>` : ''}
          <button onclick="deleteDailyTask('${t.id}')" class="delete-btn" style="padding:0; margin:0;">🗑️</button>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="view-container">
        ${isFlawless ? `<div class="banner-flawless">Flawless Victory 🏆<br><span style="font-size:16px; font-weight:normal;">You hit all your targets for today!</span></div>` : ''}
        
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px;">
          <div>
            <h1>Today's Progress</h1>
            <p class="subtitle" style="margin-bottom:0;">${format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom: 32px; align-items: stretch;">
          <!-- Left: Preparation Countdown Widget -->
          <div class="card" style="position: relative; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin-bottom: 0;">🎯 Preparation Countdown</h3>
                <button id="btn-prep-toggle" style="padding: 4px 12px; font-size: 12px; background: rgba(15,23,42,0.05); color:var(--text-primary); border:1px solid var(--border-color);">
                  ${window.showPrepSettings ? 'Cancel' : 'Reset Target'}
                </button>
              </div>
              
              ${window.showPrepSettings ? `
                <div style="margin-top: 16px; display: flex; gap: 12px; align-items: flex-end; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
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
                  <div class="budget-progress-container" style="margin: 0; height: 12px; background: rgba(0,0,0,0.05);">
                    <div class="budget-progress-bar safe" style="width: ${percentElapsed}%;"></div>
                  </div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px; text-align: right;">
                    Target: ${format(parseISO(prepEndDate), 'MMMM d, yyyy')}
                  </div>
                </div>
              `}
            </div>
          </div>

          <!-- Right: Visual Pomodoro Timer -->
          <div class="card" style="padding: 20px;">
            <div class="pomo-container">
              <div>
                <h3 style="margin-bottom: 4px;">🍅 Pomodoro Timer</h3>
                
                <!-- Mode select toggles -->
                <div style="display:flex; gap:8px; margin-bottom:12px; margin-top:8px;">
                  <button class="todo-filter-btn mode-btn ${timerMode === 'focus' ? 'active' : ''}" data-mode="focus" style="padding: 4px 10px; font-size: 11px; font-weight:700; box-shadow:none;">Focus</button>
                  <button class="todo-filter-btn mode-btn ${timerMode === 'short_break' ? 'active' : ''}" data-mode="short_break" style="padding: 4px 10px; font-size: 11px; font-weight:700; box-shadow:none;">Short Break</button>
                  <button class="todo-filter-btn mode-btn ${timerMode === 'long_break' ? 'active' : ''}" data-mode="long_break" style="padding: 4px 10px; font-size: 11px; font-weight:700; box-shadow:none;">Long Break</button>
                </div>

                <!-- Habits select dropdown -->
                <div class="input-group" style="margin-bottom: 12px; display: ${timerMode === 'focus' ? 'flex' : 'none'};">
                  <select id="pomo-category-select" style="padding:6px; font-size:12px; border-radius:6px;">
                    ${pomoHabits.map(h => `<option value="${h.id}" ${h.id === selectedCategory ? 'selected' : ''}>Work on: ${h.name}</option>`).join('')}
                  </select>
                </div>

                <div id="pomo-time-display" style="font-size: 38px; font-weight: 800; color: var(--text-primary); font-family: monospace;">25:00</div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                  <button id="pomo-btn-start" style="padding: 6px 16px; font-size: 13px; background:linear-gradient(135deg, var(--accent-green), #059669); box-shadow:none;">Start</button>
                  <button id="pomo-btn-pause" style="padding: 6px 16px; font-size: 13px; background:linear-gradient(135deg, var(--accent-orange), #ea580c); display:none; box-shadow:none;">Pause</button>
                  <button id="pomo-btn-reset" style="padding: 6px 16px; font-size: 13px; background:#f1f5f9; color:var(--text-primary); border:1px solid var(--border-color); box-shadow:none;">Reset</button>
                </div>
              </div>

              <!-- Animated Growing Tree Block -->
              <div class="tree-box">
                <svg viewBox="0 0 100 100" width="100" height="100" id="pomodoro-tree-svg">
                  <!-- Ground -->
                  <path d="M 10 90 Q 50 85 90 90 L 90 95 L 10 95 Z" fill="#8B5A2B" />
                  
                  <!-- Seed -->
                  <circle cx="50" cy="88" r="3" fill="#D2B48C" id="tree-seed" style="opacity:0;" />
                  
                  <!-- Sprout / Stem -->
                  <path d="M 50 88 Q 48 80 50 72" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" fill="none" id="tree-sprout" style="opacity:0;" />
                  <path d="M 50 72 Q 44 68 42 72 Q 46 75 50 72" fill="#10B981" id="tree-leaf-left" style="opacity:0;" />
                  <path d="M 50 73 Q 56 69 58 73 Q 54 75 50 73" fill="#10B981" id="tree-leaf-right" style="opacity:0;" />
                  
                  <!-- Trunk -->
                  <path d="M 47 90 L 49 55 L 51 55 L 53 90 Z" fill="#5C4033" id="tree-trunk" style="opacity:0;" />
                  
                  <!-- Canopy -->
                  <circle cx="50" cy="46" r="14" fill="#10B981" id="tree-canopy" style="opacity:0;" />
                  <circle cx="43" cy="42" r="10" fill="#059669" id="tree-canopy-left" style="opacity:0;" />
                  <circle cx="57" cy="42" r="10" fill="#047857" id="tree-canopy-right" style="opacity:0;" />
                  
                  <!-- Fruits -->
                  <circle cx="45" cy="44" r="2" fill="#EF4444" id="tree-fruit-1" style="opacity:0;" />
                  <circle cx="55" cy="40" r="2" fill="#EF4444" id="tree-fruit-2" style="opacity:0;" />
                  <circle cx="50" cy="50" r="2" fill="#EF4444" id="tree-fruit-3" style="opacity:0;" />

                  <!-- Watering Can (shown during break) -->
                  <g id="watering-can" style="opacity:0; transform: translate(45px, 10px) rotate(-25deg);">
                    <path d="M 10 15 L 22 15 L 22 25 L 10 25 Z" fill="#0EA5E9" />
                    <path d="M 22 18 L 28 14 L 29 16 L 22 21" fill="#0EA5E9" stroke="#0EA5E9" stroke-width="0.8" />
                    <path d="M 10 17 C 7 17 7 23 10 23" stroke="#0EA5E9" stroke-width="1.5" fill="none" />
                  </g>
                  
                  <!-- Water drops -->
                  <g id="water-drops" style="opacity:0;">
                    <circle cx="28" cy="22" r="0.8" fill="#38BDF8" class="water-drip water-drip-1" />
                    <circle cx="29" cy="25" r="0.9" fill="#38BDF8" class="water-drip water-drip-2" />
                    <circle cx="27" cy="28" r="0.7" fill="#38BDF8" class="water-drip water-drip-3" />
                  </g>
                </svg>
                <div id="tree-stage-label" class="tree-stage-label">Planted Seed</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Morning, Noon, Night Planner Blocks -->
        <h2>Daily Planner</h2>
        <div class="planner-blocks-grid" style="margin-top: 16px;">
          <!-- Morning Block -->
          <div class="planner-block-card morning">
            <div class="planner-block-header">🌅 Morning <span style="font-size:12px; font-weight:normal; color:var(--text-secondary);">5 AM - 12 PM</span></div>
            <div style="flex:1; overflow-y:auto;">
              ${morningTasks.map(renderPlannerItem).join('') || '<p style="font-size:12px; color:var(--text-secondary); text-align:center; margin-top:40px;">No morning tasks</p>'}
            </div>
          </div>

          <!-- Noon Block -->
          <div class="planner-block-card noon">
            <div class="planner-block-header">☀️ Noon <span style="font-size:12px; font-weight:normal; color:var(--text-secondary);">12 PM - 5 PM</span></div>
            <div style="flex:1; overflow-y:auto;">
              ${noonTasks.map(renderPlannerItem).join('') || '<p style="font-size:12px; color:var(--text-secondary); text-align:center; margin-top:40px;">No noon tasks</p>'}
            </div>
          </div>

          <!-- Night Block -->
          <div class="planner-block-card night">
            <div class="planner-block-header">🌙 Night <span style="font-size:12px; font-weight:normal; color:var(--text-secondary);">5 PM - 5 AM</span></div>
            <div style="flex:1; overflow-y:auto;">
              ${nightTasks.map(renderPlannerItem).join('') || '<p style="font-size:12px; color:var(--text-secondary); text-align:center; margin-top:40px;">No night tasks</p>'}
            </div>
          </div>
        </div>

        <!-- All Day Tasks / Untimed Tasks -->
        ${untimedTasks.length > 0 ? `
          <div class="card" style="margin-bottom: 24px;">
            <h3>📋 All Day / Untimed Tasks</h3>
            <div style="margin-top: 12px;">
              ${untimedTasks.map(renderPlannerItem).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Add Planner Task Card -->
        <div class="card" style="margin-bottom: 40px;">
          <h3>Add Task to Planner</h3>
          <form id="add-planner-task-form" style="display:flex; gap:16px; align-items:flex-end; margin-top:12px;">
            <div class="input-group" style="flex:2; margin-bottom:0;">
              <label>Task Title</label>
              <input type="text" id="planner-title" placeholder="e.g. Study BCS, Gym" required>
            </div>
            <div class="input-group" style="flex:1; margin-bottom:0;">
              <label>Scheduled Time (Optional)</label>
              <input type="time" id="planner-time">
            </div>
            <button type="submit">Add Task</button>
          </form>
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

    // Request permissions for notifications
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // --- TIMING MECHANICS & INTERVALS ---
    const timeDisplay = document.getElementById('pomo-time-display');
    const btnStart = document.getElementById('pomo-btn-start');
    const btnPause = document.getElementById('pomo-btn-pause');
    const btnReset = document.getElementById('pomo-btn-reset');
    const selectCategory = document.getElementById('pomo-category-select');

    if (selectCategory) {
      selectCategory.addEventListener('change', (e) => {
        selectedCategory = e.target.value;
        localStorage.setItem('pomo_selected_category', selectedCategory);
      });
    }

    // Switch timer modes
    const modeBtns = container.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        clearInterval(window.pomoIntervalId);
        timerState = 'idle';
        timerMode = e.currentTarget.dataset.mode;
        duration = getDurationForMode(timerMode);
        remainingTime = duration;

        localStorage.setItem('pomo_state', 'idle');
        localStorage.setItem('pomo_mode', timerMode);

        renderDailyView(container);
      });
    });

    function getPercentageElapsed() {
      const total = getDurationForMode(timerMode);
      const elapsed = total - remainingTime;
      return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }

    function updateTreeGraphic() {
      const seed = document.getElementById('tree-seed');
      const sprout = document.getElementById('tree-sprout');
      const leafL = document.getElementById('tree-leaf-left');
      const leafR = document.getElementById('tree-leaf-right');
      const trunk = document.getElementById('tree-trunk');
      const canopy = document.getElementById('tree-canopy');
      const canopyL = document.getElementById('tree-canopy-left');
      const canopyR = document.getElementById('tree-canopy-right');
      const f1 = document.getElementById('tree-fruit-1');
      const f2 = document.getElementById('tree-fruit-2');
      const f3 = document.getElementById('tree-fruit-3');
      const watering = document.getElementById('watering-can');
      const drops = document.getElementById('water-drops');
      const label = document.getElementById('tree-stage-label');

      if (!seed) return;

      if (timerMode !== 'focus') {
        // BREAK MODE: Show mature tree receiving watering
        seed.style.opacity = '0';
        sprout.style.opacity = '0';
        leafL.style.opacity = '0';
        leafR.style.opacity = '0';
        trunk.style.opacity = '1';
        trunk.style.transform = 'scale(1)';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(1)';
        canopyL.style.opacity = '1';
        canopyR.style.opacity = '1';
        f1.style.opacity = '0';
        f2.style.opacity = '0';
        f3.style.opacity = '0';

        watering.style.opacity = '1';
        drops.style.opacity = '1';
        label.innerText = 'Watering Break 🚿';
        return;
      }

      // FOCUS MODE: Growing tree
      watering.style.opacity = '0';
      drops.style.opacity = '0';

      const pct = getPercentageElapsed();

      if (pct < 20) {
        // Seed stage
        seed.style.opacity = '1';
        sprout.style.opacity = '0';
        leafL.style.opacity = '0';
        leafR.style.opacity = '0';
        trunk.style.opacity = '0';
        canopy.style.opacity = '0';
        canopyL.style.opacity = '0';
        canopyR.style.opacity = '0';
        f1.style.opacity = '0';
        f2.style.opacity = '0';
        f3.style.opacity = '0';
        label.innerText = 'Planted Seed 🟤';
      } else if (pct >= 20 && pct < 40) {
        // Sprout
        seed.style.opacity = '0.3';
        sprout.style.opacity = '1';
        sprout.style.transform = 'scale(0.6)';
        leafL.style.opacity = '0';
        leafR.style.opacity = '0';
        trunk.style.opacity = '0';
        canopy.style.opacity = '0';
        canopyL.style.opacity = '0';
        canopyR.style.opacity = '0';
        f1.style.opacity = '0';
        f2.style.opacity = '0';
        f3.style.opacity = '0';
        label.innerText = 'Emerging Sprout 🌱';
      } else if (pct >= 40 && pct < 60) {
        // Seedling
        seed.style.opacity = '0';
        sprout.style.opacity = '1';
        sprout.style.transform = 'scale(1)';
        leafL.style.opacity = '1';
        leafR.style.opacity = '1';
        trunk.style.opacity = '1';
        trunk.style.transform = 'scale(0.5)';
        canopy.style.opacity = '0';
        canopyL.style.opacity = '0';
        canopyR.style.opacity = '0';
        f1.style.opacity = '0';
        f2.style.opacity = '0';
        f3.style.opacity = '0';
        label.innerText = 'Growing Seedling 🌿';
      } else if (pct >= 60 && pct < 80) {
        // Young tree
        sprout.style.opacity = '0';
        leafL.style.opacity = '0';
        leafR.style.opacity = '0';
        trunk.style.opacity = '1';
        trunk.style.transform = 'scale(1)';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(0.6)';
        canopyL.style.opacity = '1';
        canopyR.style.opacity = '1';
        f1.style.opacity = '0';
        f2.style.opacity = '0';
        f3.style.opacity = '0';
        label.innerText = 'Sapling Tree 🌳';
      } else if (pct >= 80 && pct < 100) {
        // Flowering / Blossoming
        trunk.style.opacity = '1';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(1)';
        f1.style.opacity = '0.3';
        f2.style.opacity = '0.3';
        f3.style.opacity = '0.3';
        label.innerText = 'Blossoming 🌸';
      } else {
        // Fully ripe fruits
        trunk.style.opacity = '1';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(1)';
        f1.style.opacity = '1';
        f2.style.opacity = '1';
        f3.style.opacity = '1';
        label.innerText = 'Ripe Fruits! 🍎';
      }
    }

    function formatTime(ms) {
      const totalSec = Math.ceil(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    function updateTimerUI(ms) {
      if (timeDisplay) {
        timeDisplay.innerText = formatTime(ms);
      }
      updateTreeGraphic();
    }

    async function handleTimerComplete() {
      clearInterval(window.pomoIntervalId);
      playChime();

      if (timerMode === 'focus') {
        triggerPushNotification('Focus Complete!', 'Fantastic! Your tree has fully grown and harvested. Ripe fruits added.');
        
        // Auto increment daily counts
        if (selectedCategory) {
          const matchedHabitLog = pomoLogs.find(l => l.habit_id === selectedCategory);
          const currentCount = matchedHabitLog ? matchedHabitLog.completed : 0;
          await updatePomo(selectedCategory, currentCount + 1);
        }
      } else {
        triggerPushNotification('Break Over!', 'Time to get back to work. Ready to plant another seed?');
      }

      // Reset state
      timerState = 'idle';
      localStorage.setItem('pomo_state', 'idle');
      renderDailyView(container);
    }

    function startTimer() {
      timerState = 'running';
      const target = Date.now() + remainingTime;
      
      localStorage.setItem('pomo_state', 'running');
      localStorage.setItem('pomo_target_time', target.toString());

      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';

      window.pomoIntervalId = setInterval(() => {
        const ms = target - Date.now();
        if (ms <= 0) {
          handleTimerComplete();
        } else {
          remainingTime = ms;
          localStorage.setItem('pomo_remaining', remainingTime.toString());
          updateTimerUI(ms);
        }
      }, 100);
    }

    function pauseTimer() {
      clearInterval(window.pomoIntervalId);
      timerState = 'paused';
      localStorage.setItem('pomo_state', 'paused');
      localStorage.setItem('pomo_remaining', remainingTime.toString());

      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
    }

    function resetTimer() {
      clearInterval(window.pomoIntervalId);
      timerState = 'idle';
      remainingTime = duration;

      localStorage.setItem('pomo_state', 'idle');
      localStorage.removeItem('pomo_remaining');

      renderDailyView(container);
    }

    // Set Initial Controls Visibility
    if (timerState === 'running') {
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';
      
      // Clear previous tick if exists
      clearInterval(window.pomoIntervalId);
      
      // Start ticking active timer
      const target = Number(localStorage.getItem('pomo_target_time'));
      window.pomoIntervalId = setInterval(() => {
        const ms = target - Date.now();
        if (ms <= 0) {
          handleTimerComplete();
        } else {
          remainingTime = ms;
          localStorage.setItem('pomo_remaining', remainingTime.toString());
          updateTimerUI(ms);
        }
      }, 100);
    } else {
      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
    }

    // Hook Pomo Controls Click listeners
    btnStart.addEventListener('click', startTimer);
    btnPause.addEventListener('click', pauseTimer);
    btnReset.addEventListener('click', resetTimer);

    // Initial Tree Render
    updateTimerUI(remainingTime);

    // Hook prep countdown and daily tasks
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

    document.getElementById('add-planner-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('planner-title').value.trim();
      const task_time = document.getElementById('planner-time').value || null;

      await supabase.from('local_todo_tasks').insert({
        title,
        task_time,
        due_date: today,
        list_name: 'Today'
      });
      renderDailyView(container);
    });

    window.toggleDailyTask = async (id, isCompleted) => {
      await supabase.from('local_todo_tasks').update({ completed: isCompleted }).eq('id', id);
      renderDailyView(container);
    };

    window.deleteDailyTask = async (id) => {
      await supabase.from('local_todo_tasks').delete().eq('id', id);
      renderDailyView(container);
    };

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
