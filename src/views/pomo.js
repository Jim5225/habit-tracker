import { supabase } from '../supabase.js';
import { format } from 'date-fns';

export async function renderPomoView(container) {
  const today = format(new Date(), 'yyyy-MM-dd');

  // --- TIMER STATE INITIALIZATION ---
  let timerState = localStorage.getItem('pomo_state') || 'idle'; 
  let timerMode = localStorage.getItem('pomo_mode') || 'focus'; 
  let selectedCategory = localStorage.getItem('pomo_selected_category') || '';
  let duration = getDurationForMode(timerMode); 
  
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

  function playChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); 
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); 
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

    if (!selectedCategory && pomoHabits.length > 0) {
      selectedCategory = pomoHabits[0].id;
      localStorage.setItem('pomo_selected_category', selectedCategory);
    }

    container.innerHTML = `
      <div class="view-container" style="display:flex; flex-direction:column; align-items:center;">
        <h1 style="font-size:32px; margin-bottom: 8px;">🍅 Pomodoro Timer</h1>
        <p class="subtitle" style="margin-bottom: 32px;">Grow your focus tree</p>
        
        <div class="card" style="width: 100%; max-width: 600px; padding: 40px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1);">
          
          <div style="display:flex; gap:12px; margin-bottom:24px;">
            <button class="mode-btn ${timerMode === 'focus' ? 'active' : ''}" data-mode="focus" style="padding: 8px 16px; font-weight:700; box-shadow:none;">Focus (25m)</button>
            <button class="mode-btn ${timerMode === 'short_break' ? 'active' : ''}" data-mode="short_break" style="padding: 8px 16px; font-weight:700; box-shadow:none;">Short Break (5m)</button>
            <button class="mode-btn ${timerMode === 'long_break' ? 'active' : ''}" data-mode="long_break" style="padding: 8px 16px; font-weight:700; box-shadow:none;">Long Break (15m)</button>
          </div>

          <div class="input-group" style="margin-bottom: 24px; width: 100%; max-width: 300px; display: ${timerMode === 'focus' ? 'block' : 'none'};">
            <select id="pomo-category-select" style="padding:10px; font-size:16px; border-radius:8px; width: 100%;">
              ${pomoHabits.map(h => `<option value="${h.id}" ${h.id === selectedCategory ? 'selected' : ''}>Work on: ${h.name}</option>`).join('')}
            </select>
          </div>

          <!-- GIANT TREE BOX -->
          <div class="giant-tree-box" style="margin-bottom: 24px; display: flex; flex-direction: column; align-items: center;">
            <svg viewBox="0 0 100 100" width="300" height="300" id="pomodoro-tree-svg">
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
            <div id="tree-stage-label" class="tree-stage-label" style="font-size:18px; margin-top:16px;">Planted Seed</div>
          </div>

          <div id="pomo-time-display" style="font-size: 64px; font-weight: 800; color: var(--text-primary); font-family: monospace; letter-spacing: 2px;">25:00</div>
          
          <div style="display:flex; gap:16px; margin-top:24px;">
            <button id="pomo-btn-start" style="padding: 12px 32px; font-size: 18px; background:linear-gradient(135deg, var(--accent-green), #059669); box-shadow:0 4px 15px rgba(16, 185, 129, 0.3);">Start</button>
            <button id="pomo-btn-pause" style="padding: 12px 32px; font-size: 18px; background:linear-gradient(135deg, var(--accent-orange), #ea580c); display:none; box-shadow:0 4px 15px rgba(249, 115, 22, 0.3);">Pause</button>
            <button id="pomo-btn-reset" style="padding: 12px 32px; font-size: 18px; background:#f1f5f9; color:var(--text-primary); border:1px solid var(--border-color);">Reset</button>
          </div>
        </div>
      </div>
    `;

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

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

        renderPomoView(container);
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

      watering.style.opacity = '0';
      drops.style.opacity = '0';

      const pct = getPercentageElapsed();

      if (pct < 20) {
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
        trunk.style.opacity = '1';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(1)';
        f1.style.opacity = '0.3';
        f2.style.opacity = '0.3';
        f3.style.opacity = '0.3';
        label.innerText = 'Blossoming 🌸';
      } else {
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
        
        if (selectedCategory) {
          const matchedHabitLog = pomoLogs.find(l => l.habit_id === selectedCategory);
          const currentCount = matchedHabitLog ? matchedHabitLog.completed : 0;
          await supabase.from('pomo_logs').upsert({
            habit_id: selectedCategory,
            log_date: today,
            completed: currentCount + 1
          }, { onConflict: 'habit_id,log_date' });
        }
      } else {
        triggerPushNotification('Break Over!', 'Time to get back to work. Ready to plant another seed?');
      }

      timerState = 'idle';
      localStorage.setItem('pomo_state', 'idle');
      renderPomoView(container);
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

      renderPomoView(container);
    }

    if (timerState === 'running') {
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';
      
      clearInterval(window.pomoIntervalId);
      
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

    btnStart.addEventListener('click', startTimer);
    btnPause.addEventListener('click', pauseTimer);
    btnReset.addEventListener('click', resetTimer);

    updateTimerUI(remainingTime);

  } catch (error) {
    console.error("Error loading pomo view:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
