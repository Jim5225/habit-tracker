import { supabase } from '../supabase.js';
import { format } from 'date-fns';

export async function renderPomoView(container) {
  const today = format(new Date(), 'yyyy-MM-dd');

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
      <div class="view-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height: 85vh; padding: 20px;">
        
        <div style="width: 100%; max-width: 600px; display: flex; flex-direction: column; align-items: center;">
          
          <!-- ONLY CATEGORY DROPDOWN -->
          <div class="input-group" style="margin-bottom: 20px; width: 100%; display: ${timerMode === 'focus' ? 'block' : 'none'};">
            <select id="pomo-category-select" style="padding:16px; font-size:24px; font-weight: bold; border-radius:12px; width: 100%; text-align: center; border: 2px solid var(--border-color); background: var(--card-bg); color: var(--text-primary); cursor: pointer;">
              ${pomoHabits.map(h => `<option value="${h.id}" ${h.id === selectedCategory ? 'selected' : ''}>${h.name}</option>`).join('')}
            </select>
          </div>

          <!-- MASSIVE CONTINUOUS GROWTH TREE -->
          <div style="margin-bottom: 10px; display: flex; flex-direction: column; align-items: center; width: 100%; position: relative;">
            <svg viewBox="0 0 100 100" width="100%" height="450" id="pomodoro-tree-svg" style="max-width: 500px; filter: drop-shadow(0 20px 30px rgba(16, 185, 129, 0.3)); overflow:visible;">
              <defs>
                <style>
                  .grow-element {
                    transform-origin: 50px 90px;
                    transition: transform 0.1s linear, opacity 0.5s ease;
                  }
                  .fruit-element {
                    transform-origin: center center;
                    transition: transform 0.2s ease, opacity 0.5s ease;
                  }
                </style>
              </defs>
              <!-- Ground -->
              <path d="M -10 90 Q 50 82 110 90 L 110 100 L -10 100 Z" fill="#8B5A2B" />
              
              <!-- Seed (Opacates initially) -->
              <circle cx="50" cy="88" r="3" fill="#D2B48C" id="tree-seed" class="grow-element" style="opacity:0;" />
              
              <!-- Sprout (Scales up early) -->
              <g id="tree-sprout-group" class="grow-element" style="opacity:0;">
                <path d="M 50 88 Q 48 80 50 72" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" fill="none" />
                <path d="M 50 72 Q 44 68 42 72 Q 46 75 50 72" fill="#10B981" />
                <path d="M 50 73 Q 56 69 58 73 Q 54 75 50 73" fill="#10B981" />
              </g>

              <!-- Mature Tree Trunk (Scales up from base) -->
              <path d="M 46 90 L 49 40 L 51 40 L 54 90 Z" fill="#5C4033" id="tree-trunk" class="grow-element" style="opacity:0;" />
              
              <!-- Canopy (Scales up from top of trunk) -->
              <g id="tree-canopy-group" class="grow-element" style="opacity:0; transform-origin: 50px 40px;">
                <circle cx="50" cy="35" r="22" fill="#10B981" />
                <circle cx="35" cy="45" r="16" fill="#059669" />
                <circle cx="65" cy="45" r="16" fill="#047857" />
              </g>
              
              <!-- Fruits (Pop in at the end) -->
              <g id="tree-fruits-group" style="opacity:0;">
                <circle cx="45" cy="25" r="3.5" fill="#EF4444" class="fruit-element" style="transform-origin: 45px 25px;" />
                <circle cx="62" cy="35" r="3.5" fill="#EF4444" class="fruit-element" style="transform-origin: 62px 35px;" />
                <circle cx="38" cy="42" r="3.5" fill="#EF4444" class="fruit-element" style="transform-origin: 38px 42px;" />
                <circle cx="50" cy="45" r="3.5" fill="#EF4444" class="fruit-element" style="transform-origin: 50px 45px;" />
                <circle cx="28" cy="48" r="3.5" fill="#EF4444" class="fruit-element" style="transform-origin: 28px 48px;" />
              </g>

              <!-- Break Mode: Watering Can -->
              <g id="watering-can" style="opacity:0; transform-origin: center center; transform: translate(35px, 0px) rotate(-25deg) scale(1.5);">
                <path d="M 10 15 L 22 15 L 22 25 L 10 25 Z" fill="#0EA5E9" />
                <path d="M 22 18 L 28 14 L 29 16 L 22 21" fill="#0EA5E9" stroke="#0EA5E9" stroke-width="0.8" />
                <path d="M 10 17 C 7 17 7 23 10 23" stroke="#0EA5E9" stroke-width="1.5" fill="none" />
              </g>
              
              <g id="water-drops" style="opacity:0; transform: translate(35px, 0px) scale(1.5);">
                <circle cx="28" cy="22" r="0.8" fill="#38BDF8" />
                <circle cx="29" cy="25" r="0.9" fill="#38BDF8" />
                <circle cx="27" cy="28" r="0.7" fill="#38BDF8" />
              </g>
            </svg>
            
            <div id="pomo-time-display" style="font-size: 110px; font-weight: 900; color: var(--text-primary); font-family: monospace; letter-spacing: 2px; line-height: 1; margin-top: -20px; z-index: 10;">25:00</div>
          </div>
          
          <!-- START / STOP BUTTONS ONLY -->
          <div style="display:flex; gap:16px; margin-top:20px; width: 100%;">
            <button id="pomo-btn-start" style="flex: 2; padding: 24px; font-size: 28px; font-weight: 800; border-radius: 24px; background:linear-gradient(135deg, var(--accent-green), #059669); color: white; box-shadow:0 10px 25px rgba(16, 185, 129, 0.4); border:none; cursor:pointer;">START POMODORO</button>
            <button id="pomo-btn-pause" style="flex: 2; padding: 24px; font-size: 28px; font-weight: 800; border-radius: 24px; background:linear-gradient(135deg, var(--accent-orange), #ea580c); color: white; display:none; box-shadow:0 10px 25px rgba(249, 115, 22, 0.4); border:none; cursor:pointer;">PAUSE</button>
            <button id="pomo-btn-break" style="flex: 1; padding: 24px; font-size: 24px; font-weight: 700; border-radius: 24px; background:#f1f5f9; color:var(--text-primary); border:2px solid var(--border-color); cursor:pointer;">Break (5m)</button>
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
    const btnBreak = document.getElementById('pomo-btn-break');
    const selectCategory = document.getElementById('pomo-category-select');

    if (selectCategory) {
      selectCategory.addEventListener('change', (e) => {
        selectedCategory = e.target.value;
        localStorage.setItem('pomo_selected_category', selectedCategory);
      });
    }

    btnBreak.addEventListener('click', () => {
      clearInterval(window.pomoIntervalId);
      timerState = 'idle';
      timerMode = timerMode === 'focus' ? 'short_break' : 'focus';
      duration = getDurationForMode(timerMode);
      remainingTime = duration;

      localStorage.setItem('pomo_state', 'idle');
      localStorage.setItem('pomo_mode', timerMode);

      renderPomoView(container);
    });

    function getPercentageElapsed() {
      const total = getDurationForMode(timerMode);
      const elapsed = total - remainingTime;
      return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }

    function updateTreeGraphic() {
      const seed = document.getElementById('tree-seed');
      const sprout = document.getElementById('tree-sprout-group');
      const trunk = document.getElementById('tree-trunk');
      const canopy = document.getElementById('tree-canopy-group');
      const fruits = document.getElementById('tree-fruits-group');
      const watering = document.getElementById('watering-can');
      const drops = document.getElementById('water-drops');

      if (!seed) return;

      if (timerMode !== 'focus') {
        seed.style.opacity = '0';
        sprout.style.opacity = '0';
        trunk.style.opacity = '1';
        trunk.style.transform = 'scale(1)';
        canopy.style.opacity = '1';
        canopy.style.transform = 'scale(1)';
        fruits.style.opacity = '0';

        watering.style.opacity = '1';
        drops.style.opacity = '1';
        return;
      }

      watering.style.opacity = '0';
      drops.style.opacity = '0';

      const pct = getPercentageElapsed();

      if (pct < 10) {
        seed.style.opacity = '1';
        seed.style.transform = `scale(${Math.max(0, pct / 10)})`;
        sprout.style.opacity = '0';
        trunk.style.opacity = '0';
        canopy.style.opacity = '0';
        fruits.style.opacity = '0';
      } else if (pct < 30) {
        const localPct = (pct - 10) / 20; 
        seed.style.opacity = `${1 - localPct}`;
        sprout.style.opacity = '1';
        sprout.style.transform = `scale(${localPct})`;
        trunk.style.opacity = '0';
        canopy.style.opacity = '0';
        fruits.style.opacity = '0';
      } else if (pct < 60) {
        const localPct = (pct - 30) / 30; 
        seed.style.opacity = '0';
        sprout.style.opacity = `${1 - localPct}`;
        trunk.style.opacity = '1';
        trunk.style.transform = `scaleY(${Math.max(0.1, localPct)})`;
        canopy.style.opacity = '0';
        fruits.style.opacity = '0';
      } else if (pct < 85) {
        const localPct = (pct - 60) / 25; 
        sprout.style.opacity = '0';
        trunk.style.opacity = '1';
        trunk.style.transform = 'scaleY(1)';
        canopy.style.opacity = '1';
        canopy.style.transform = `scale(${localPct})`;
        fruits.style.opacity = '0';
      } else {
        const localPct = (pct - 85) / 15; 
        trunk.style.transform = 'scaleY(1)';
        canopy.style.transform = 'scale(1)';
        fruits.style.opacity = '1';
        const fruitElems = fruits.querySelectorAll('.fruit-element');
        fruitElems.forEach((f, i) => {
           const fpct = Math.min(1, Math.max(0, localPct * 2 - (i * 0.1)));
           f.style.transform = `scale(${fpct})`;
        });
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
      btnPause.style.display = 'block';
      if(timerMode === 'focus') btnBreak.style.display = 'block';

      window.pomoIntervalId = setInterval(() => {
        const ms = target - Date.now();
        if (ms <= 0) {
          handleTimerComplete();
        } else {
          remainingTime = ms;
          localStorage.setItem('pomo_remaining', remainingTime.toString());
          updateTimerUI(ms);
        }
      }, 50); 
    }

    function pauseTimer() {
      clearInterval(window.pomoIntervalId);
      timerState = 'paused';
      localStorage.setItem('pomo_state', 'paused');
      localStorage.setItem('pomo_remaining', remainingTime.toString());

      btnStart.style.display = 'block';
      btnStart.innerText = 'RESUME POMODORO';
      btnPause.style.display = 'none';
    }

    if (timerState === 'running') {
      btnStart.style.display = 'none';
      btnPause.style.display = 'block';
      
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
      }, 50);
    } else if (timerState === 'paused') {
      btnStart.style.display = 'block';
      btnStart.innerText = 'RESUME POMODORO';
      btnPause.style.display = 'none';
    } else {
      btnStart.style.display = 'block';
      btnPause.style.display = 'none';
    }

    if (timerMode !== 'focus') {
       btnStart.innerText = 'START BREAK';
       btnBreak.innerText = 'Back to Focus';
    }

    btnStart.addEventListener('click', startTimer);
    btnPause.addEventListener('click', pauseTimer);

    updateTimerUI(remainingTime);

  } catch (error) {
    console.error("Error loading pomo view:", error);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading data.</p>`;
  }
}
