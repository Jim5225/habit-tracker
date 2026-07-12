import { supabase } from '../supabase.js';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import Chart from 'chart.js/auto';

let charts = [];

export async function renderTodoView(container) {
  const token = localStorage.getItem('ticktick_access_token');
  const storedClientId = localStorage.getItem('ticktick_client_id') || '';
  const storedClientSecret = localStorage.getItem('ticktick_client_secret') || '';
  const storedRedirectUri = localStorage.getItem('ticktick_redirect_uri') || window.location.origin + '/';
  
  let activeFilter = localStorage.getItem('todo_active_filter') || 'today';
  let showConnectForm = false;

  async function loadData() {
    if (token) {
      await loadTickTickDashboard();
    } else {
      await loadLocalDashboard();
    }
  }

  // --- LOCAL TODO LIST LOGIC ---
  async function loadLocalDashboard() {
    container.innerHTML = `
      <div class="view-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h1>Todo List Planner</h1>
          <button id="btn-toggle-connect" style="background:var(--accent-purple); padding:8px 16px; font-size:14px;">🔌 Connect to TickTick</button>
        </div>

        <div id="connect-settings-card" class="card" style="display: ${showConnectForm ? 'block' : 'none'}; margin-bottom: 24px;">
          <h2>Connect with TickTick</h2>
          <p style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">
            Enter your developer keys. Make sure the Redirect URI matches the one in your TickTick Developer Console.
          </p>
          <div class="input-group">
            <label for="todo-client-id">Client ID</label>
            <input type="text" id="todo-client-id" value="${storedClientId}" placeholder="Enter Client ID">
          </div>
          <div class="input-group">
            <label for="todo-client-secret">Client Secret</label>
            <input type="password" id="todo-client-secret" value="${storedClientSecret}" placeholder="Enter Client Secret">
          </div>
          <div class="input-group">
            <label for="todo-redirect-uri">Redirect URI</label>
            <input type="text" id="todo-redirect-uri" value="${storedRedirectUri}">
          </div>
          <button id="btn-save-oauth" style="width:100%; margin-top:8px;">Authorize & Connect</button>
        </div>

        <!-- Add Local Task Form -->
        <div class="card" style="margin-bottom: 24px;">
          <h2>Create New Task</h2>
          <form id="add-local-task-form" style="display:flex; gap:16px; align-items:flex-end; margin-top:12px;">
            <div class="input-group" style="flex:2; margin-bottom:0;">
              <label>Task Title</label>
              <input type="text" id="local-task-title" placeholder="e.g. Study, call friends" required>
            </div>
            <div class="input-group" style="flex:1; margin-bottom:0;">
              <label>List/Category</label>
              <select id="local-task-list" required>
                <option value="Inbox">Inbox</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="Scheduled">Scheduled</option>
              </select>
            </div>
            <div class="input-group" style="flex:1; margin-bottom:0;">
              <label>Due Date</label>
              <input type="date" id="local-task-date" value="${format(new Date(), 'yyyy-MM-dd')}" required>
            </div>
            <div class="input-group" style="flex:1; margin-bottom:0;">
              <label>Time (Optional)</label>
              <input type="time" id="local-task-time">
            </div>
            <button type="submit">Add Task</button>
          </form>
        </div>

        <div id="local-todo-dashboard">
          <div style="display:flex; justify-content:center; padding:20px;">Loading tasks...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-toggle-connect').addEventListener('click', () => {
      showConnectForm = !showConnectForm;
      const card = document.getElementById('connect-settings-card');
      card.style.display = showConnectForm ? 'block' : 'none';
    });

    document.getElementById('btn-save-oauth').addEventListener('click', () => {
      const clientId = document.getElementById('todo-client-id').value.trim();
      const clientSecret = document.getElementById('todo-client-secret').value.trim();
      const redirectUri = document.getElementById('todo-redirect-uri').value.trim();

      localStorage.setItem('ticktick_client_id', clientId);
      localStorage.setItem('ticktick_client_secret', clientSecret);
      localStorage.setItem('ticktick_redirect_uri', redirectUri);

      const authUrl = `https://ticktick.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tasks:read%20tasks:write&response_type=code`;
      window.location.href = authUrl;
    });

    document.getElementById('add-local-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('local-task-title').value.trim();
      const list_name = document.getElementById('local-task-list').value;
      const due_date = document.getElementById('local-task-date').value;
      const task_time = document.getElementById('local-task-time').value || null;

      await supabase.from('local_todo_tasks').insert({
        title,
        list_name,
        due_date,
        task_time
      });
      loadData();
    });

    const { data: tasks } = await supabase.from('local_todo_tasks').select('*');
    renderLocalTasksList(tasks || []);
  }

  function renderLocalTasksList(tasks) {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const todayTasks = tasks.filter(t => {
      const due = parseISO(t.due_date);
      return t.list_name === 'Today' || isWithinInterval(due, { start: todayStart, end: todayEnd });
    });

    const weekTasks = tasks.filter(t => {
      const due = parseISO(t.due_date);
      return t.list_name === 'This Week' || isWithinInterval(due, { start: weekStart, end: weekEnd });
    });

    const inboxTasks = tasks.filter(t => t.list_name === 'Inbox');
    
    const scheduledTasks = tasks.filter(t => {
      const due = parseISO(t.due_date);
      return t.list_name === 'Scheduled' || (due > todayEnd && !t.completed);
    });

    const totalCount = tasks.length;
    const completedCount = tasks.filter(t => t.completed).length;
    const pendingCount = totalCount - completedCount;
    const compRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const pendRate = totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : 0;

    let filtered = [];
    if (activeFilter === 'today') filtered = todayTasks;
    else if (activeFilter === 'week') filtered = weekTasks;
    else if (activeFilter === 'inbox') filtered = inboxTasks;
    else if (activeFilter === 'scheduled') filtered = scheduledTasks;

    const tasksHtml = filtered.map(t => {
      let timeStr = '';
      if (t.task_time) {
        const parts = t.task_time.split(':');
        const h = parseInt(parts[0]);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const dispH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        timeStr = ` ⏰ ${dispH}:${parts[1]} ${ampm}`;
      }

      return `
        <div class="todo-task-item ${t.completed ? 'completed' : ''}">
          <input type="checkbox" class="todo-task-checkbox" ${t.completed ? 'checked' : ''} 
            onclick="toggleLocalTask('${t.id}', ${!t.completed})">
          <div class="todo-task-content">
            <div class="todo-task-title">${t.title}</div>
            <div class="todo-task-details">
              <span class="todo-task-tag">Local</span>
              <span class="todo-task-due">📅 Due: ${format(parseISO(t.due_date), 'MMM d, yyyy')}${timeStr}</span>
            </div>
          </div>
          <button class="delete-btn" onclick="deleteLocalTask('${t.id}')">🗑️</button>
        </div>
      `;
    }).join('');

    const dashboardEl = document.getElementById('local-todo-dashboard');
    dashboardEl.innerHTML = `
      <div class="budget-summary-grid">
        <div class="card summary-card">
          <h3>Completion Rate</h3>
          <div class="summary-value income">${compRate}%</div>
          <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">${completedCount} completed tasks</p>
        </div>
        <div class="card summary-card">
          <h3>Pending Rate</h3>
          <div class="summary-value" style="color:var(--accent-orange);">${pendRate}%</div>
          <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">${pendingCount} active tasks</p>
        </div>
        <div class="card summary-card">
          <h3>Total Saved</h3>
          <div class="summary-value" style="color:var(--accent-cyan);">${totalCount}</div>
          <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">In local planner</p>
        </div>
      </div>

      <div class="grid-2" style="align-items: start;">
        <div class="card">
          <div class="todo-filters">
            <button class="todo-filter-btn ${activeFilter === 'today' ? 'active' : ''}" data-filter="today">Today (${todayTasks.length})</button>
            <button class="todo-filter-btn ${activeFilter === 'week' ? 'active' : ''}" data-filter="week">This Week (${weekTasks.length})</button>
            <button class="todo-filter-btn ${activeFilter === 'inbox' ? 'active' : ''}" data-filter="inbox">Inbox (${inboxTasks.length})</button>
            <button class="todo-filter-btn ${activeFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">Scheduled (${scheduledTasks.length})</button>
          </div>
          <div class="todo-list-container">
            ${tasksHtml || '<p style="color:var(--text-secondary); text-align:center; padding:40px;">No tasks found in this view.</p>'}
          </div>
        </div>

        <div class="card" style="text-align: center;">
          <h2>Task Metrics Overview</h2>
          <div style="max-height: 250px; display:flex; justify-content:center; margin-top: 24px;">
            <canvas id="todoStatsChart"></canvas>
          </div>
        </div>
      </div>
    `;

    const filterBtns = dashboardEl.querySelectorAll('.todo-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeFilter = e.currentTarget.dataset.filter;
        localStorage.setItem('todo_active_filter', activeFilter);
        loadData();
      });
    });

    renderChart(completedCount, pendingCount);

    window.toggleLocalTask = async (id, comp) => {
      await supabase.from('local_todo_tasks').update({ completed: comp }).eq('id', id);
      loadData();
    };

    window.deleteLocalTask = async (id) => {
      await supabase.from('local_todo_tasks').delete().eq('id', id);
      loadData();
    };
  }

  // --- TICKTICK TODO LIST LOGIC ---
  async function loadTickTickDashboard() {
    container.innerHTML = `
      <div class="view-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h1>TickTick Tasks Dashboard</h1>
          <button id="btn-disconnect-ticktick" style="background:var(--accent-red); padding:8px 16px; font-size:14px;">Disconnect Account</button>
        </div>
        <div style="display:flex; justify-content:center; padding:40px;">
          <div class="loading">Loading tasks from TickTick...</div>
        </div>
      </div>
    `;
    document.getElementById('btn-disconnect-ticktick').addEventListener('click', handleDisconnect);

    const { active, completed, all } = await fetchAllTasks();

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const todayTasks = all.filter(t => {
      if (!t.dueDate) return false;
      const due = parseISO(t.dueDate);
      return isWithinInterval(due, { start: todayStart, end: todayEnd }) || (t.completed && isWithinInterval(parseISO(t.modifiedTime), { start: todayStart, end: todayEnd }));
    });

    const weekTasks = all.filter(t => {
      if (!t.dueDate) return false;
      const due = parseISO(t.dueDate);
      return isWithinInterval(due, { start: weekStart, end: weekEnd }) || (t.completed && isWithinInterval(parseISO(t.modifiedTime), { start: weekStart, end: weekEnd }));
    });

    const inboxTasks = all.filter(t => t.projectName && t.projectName.toLowerCase() === 'inbox');
    
    const scheduledTasks = all.filter(t => {
      if (!t.dueDate) return false;
      const due = parseISO(t.dueDate);
      return due > todayEnd && !t.completed;
    });

    const totalCount = all.length;
    const completedCount = completed.length;
    const pendingCount = active.length;
    const compRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const pendRate = totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : 0;

    let filtered = [];
    if (activeFilter === 'today') filtered = todayTasks;
    else if (activeFilter === 'week') filtered = weekTasks;
    else if (activeFilter === 'inbox') filtered = inboxTasks;
    else if (activeFilter === 'scheduled') filtered = scheduledTasks;

    const tasksHtml = filtered.map(t => {
      const isOverdue = t.dueDate && parseISO(t.dueDate) < todayStart && !t.completed;
      const isToday = t.dueDate && isWithinInterval(parseISO(t.dueDate), { start: todayStart, end: todayEnd }) && !t.completed;

      let dueText = '';
      let dueClass = '';
      if (t.dueDate) {
        dueText = format(parseISO(t.dueDate), 'MMM d, h:mm a');
        if (isOverdue) {
          dueText = `Overdue: ${dueText}`;
          dueClass = 'overdue';
        } else if (isToday) {
          dueText = `Today: ${dueText}`;
          dueClass = 'today';
        }
      }

      return `
        <div class="todo-task-item ${t.completed ? 'completed' : ''}">
          <input type="checkbox" class="todo-task-checkbox" ${t.completed ? 'checked disabled' : ''} 
            onclick="completeTickTask('${t.projectId}', '${t.id}')">
          <div class="todo-task-content">
            <div class="todo-task-title">${t.title}</div>
            <div class="todo-task-details">
              <span class="todo-task-tag" style="border-left: 3px solid ${t.projectColor || 'var(--border-color)'};">
                ${t.projectName || 'Task'}
              </span>
              ${dueText ? `<span class="todo-task-due ${dueClass}">📅 ${dueText}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="view-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h1>TickTick Tasks Dashboard</h1>
          <button id="btn-disconnect-ticktick" style="background:var(--accent-red); padding:8px 16px; font-size:14px;">Disconnect Account</button>
        </div>

        <div class="budget-summary-grid">
          <div class="card summary-card">
            <h3>Completion Rate</h3>
            <div class="summary-value income">${compRate}%</div>
            <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">${completedCount} completed tasks</p>
          </div>
          <div class="card summary-card">
            <h3>Pending Rate</h3>
            <div class="summary-value" style="color:var(--accent-orange);">${pendRate}%</div>
            <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">${pendingCount} active tasks</p>
          </div>
          <div class="card summary-card">
            <h3>Total Connected</h3>
            <div class="summary-value" style="color:var(--accent-cyan);">${totalCount}</div>
            <p style="color:var(--text-secondary); font-size:12px; margin-top:4px;">Synced tasks</p>
          </div>
        </div>

        <div class="grid-2" style="align-items: start;">
          <div class="card">
            <div class="todo-filters">
              <button class="todo-filter-btn ${activeFilter === 'today' ? 'active' : ''}" data-filter="today">Today (${todayTasks.length})</button>
              <button class="todo-filter-btn ${activeFilter === 'week' ? 'active' : ''}" data-filter="week">This Week (${weekTasks.length})</button>
              <button class="todo-filter-btn ${activeFilter === 'inbox' ? 'active' : ''}" data-filter="inbox">Inbox (${inboxTasks.length})</button>
              <button class="todo-filter-btn ${activeFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">Scheduled (${scheduledTasks.length})</button>
            </div>
            <div class="todo-list-container">
              ${tasksHtml || '<p style="color:var(--text-secondary); text-align:center; padding:40px;">No tasks found in this view.</p>'}
            </div>
          </div>

          <div class="card" style="text-align: center;">
            <h2>Task Metrics Overview</h2>
            <div style="max-height: 250px; display:flex; justify-content:center; margin-top: 24px;">
              <canvas id="todoStatsChart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-disconnect-ticktick').addEventListener('click', handleDisconnect);

    const filterBtns = container.querySelectorAll('.todo-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeFilter = e.currentTarget.dataset.filter;
        localStorage.setItem('todo_active_filter', activeFilter);
        loadData();
      });
    });

    renderChart(completedCount, pendingCount);

    window.completeTickTask = async (projectId, taskId) => {
      try {
        const url = `https://corsproxy.io/?https://api.ticktick.com/open/v1/project/${projectId}/task/${taskId}/complete`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          loadData();
        }
      } catch (err) {
        console.error(err);
      }
    };
  }

  // --- CHART RENDERING ---
  function renderChart(completed, pending) {
    charts.forEach(c => c.destroy());
    charts = [];

    const canvas = document.getElementById('todoStatsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending'],
        datasets: [{
          data: [completed, pending],
          backgroundColor: ['#10b981', '#f97316'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#f3f4f6' } }
        }
      }
    }));
  }

  // --- API FETCHERS ---
  async function fetchAllTasks() {
    try {
      const projects = await apiFetch('/project');
      const projectIds = projects.map(p => p.id);

      const activeTasksPromises = projectIds.map(id => apiFetch(`/project/${id}/data`).catch(() => null));
      const projectsData = await Promise.all(activeTasksPromises);

      let activeTasks = [];
      projectsData.forEach(pData => {
        if (pData && pData.tasks) {
          activeTasks = activeTasks.concat(pData.tasks.map(t => ({
            ...t,
            projectColor: pData.project.color,
            projectName: pData.project.name,
            completed: false
          })));
        }
      });

      let completedTasks = [];
      try {
        const completedRes = await apiFetch('/task/completed', {
          method: 'POST',
          body: JSON.stringify({ projectIds })
        });
        completedTasks = (completedRes || []).map(t => {
          const matchedProj = projects.find(p => p.id === t.projectId) || {};
          return {
            ...t,
            projectColor: matchedProj.color,
            projectName: matchedProj.name,
            completed: true
          };
        });
      } catch (err) {
        console.error("Error fetching completed tasks:", err);
      }

      return {
        active: activeTasks,
        completed: completedTasks,
        all: [...activeTasks, ...completedTasks]
      };
    } catch (err) {
      console.error(err);
      return { active: [], completed: [], all: [] };
    }
  }

  loadData();
}
