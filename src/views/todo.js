import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import Chart from 'chart.js/auto';

let charts = [];

export async function renderTodoView(container) {
  const token = localStorage.getItem('ticktick_access_token');
  const storedClientId = localStorage.getItem('ticktick_client_id') || '';
  const storedClientSecret = localStorage.getItem('ticktick_client_secret') || '';
  const storedRedirectUri = localStorage.getItem('ticktick_redirect_uri') || window.location.origin + '/';

  function saveConfigAndConnect() {
    const clientId = document.getElementById('todo-client-id').value.trim();
    const clientSecret = document.getElementById('todo-client-secret').value.trim();
    const redirectUri = document.getElementById('todo-redirect-uri').value.trim();

    localStorage.setItem('ticktick_client_id', clientId);
    localStorage.setItem('ticktick_client_secret', clientSecret);
    localStorage.setItem('ticktick_redirect_uri', redirectUri);

    // Redirect to TickTick OAuth Authorize page
    const authUrl = `https://ticktick.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tasks:read%20tasks:write&response_type=code`;
    window.location.href = authUrl;
  }

  function handleDisconnect() {
    localStorage.removeItem('ticktick_access_token');
    renderTodoView(container);
  }

  // API Request helper
  async function apiFetch(endpoint, options = {}) {
    const url = `https://corsproxy.io/?https://api.ticktick.com/open/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('ticktick_access_token');
        renderTodoView(container);
      }
      throw new Error(`TickTick API Error: ${response.statusText}`);
    }
    return response.json();
  }

  async function fetchAllTasks() {
    try {
      // 1. Fetch all projects/lists
      const projects = await apiFetch('/project');
      const projectIds = projects.map(p => p.id);

      // 2. Fetch active tasks for each project
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

      // 3. Fetch completed tasks (POST /task/completed)
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

  // Complete a task in TickTick
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
        // Reload tasks list
        loadAndRenderTasks();
      } else {
        alert("Failed to complete task.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // If not authenticated, render setup form
  if (!token) {
    container.innerHTML = `
      <div class="view-container">
        <h1>Connect to TickTick</h1>
        <p class="subtitle">Sync your tasks and track completion metrics</p>
        
        <div class="card" style="max-width: 600px;">
          <h2>OAuth Setup</h2>
          <p style="color:var(--text-secondary); font-size:14px; margin-bottom:20px;">
            To connect, register an application on the <a href="https://developer.ticktick.com/" target="_blank" style="color:var(--accent-cyan);">TickTick Developer Center</a>. Set the Redirect URI to match the address of this app.
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
            <input type="text" id="todo-redirect-uri" value="${storedRedirectUri}" placeholder="Redirect URL">
          </div>
          <button id="btn-connect-ticktick" style="width:100%; margin-top:16px;">Connect TickTick Account</button>
        </div>
      </div>
    `;
    document.getElementById('btn-connect-ticktick').addEventListener('click', saveConfigAndConnect);
    return;
  }

  // Main task dashboard rendering
  async function loadAndRenderTasks() {
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

    // Grouping tasks
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

    // Stats calculations
    const totalCount = all.length;
    const completedCount = completed.length;
    const pendingCount = active.length;
    const compRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const pendRate = totalCount > 0 ? Math.round((pendingCount / totalCount) * 100) : 0;

    let activeFilter = 'today';

    function renderActiveList() {
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

      document.getElementById('todo-tasks-list').innerHTML = tasksHtml || '<p style="color:var(--text-secondary); text-align:center; padding:40px;">No tasks found in this view.</p>';
    }

    container.innerHTML = `
      <div class="view-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h1>TickTick Tasks Dashboard</h1>
          <button id="btn-disconnect-ticktick" style="background:var(--accent-red); padding:8px 16px; font-size:14px;">Disconnect Account</button>
        </div>

        <!-- Dashboard Stats Widgets -->
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

        <div class="grid-2" style="margin-bottom: 32px; align-items: start;">
          <!-- Task List Column -->
          <div class="card">
            <div class="todo-filters">
              <button class="todo-filter-btn active" data-filter="today">Today (${todayTasks.length})</button>
              <button class="todo-filter-btn" data-filter="week">This Week (${weekTasks.length})</button>
              <button class="todo-filter-btn" data-filter="inbox">Inbox (${inboxTasks.length})</button>
              <button class="todo-filter-btn" data-filter="scheduled">Scheduled (${scheduledTasks.length})</button>
            </div>
            
            <div id="todo-tasks-list" class="todo-list-container">
              <!-- Rendered task list items -->
            </div>
          </div>

          <!-- Statistical View Column -->
          <div class="card" style="text-align: center;">
            <h2>Task Metrics Overview</h2>
            <div style="max-height: 250px; display:flex; justify-content:center; margin-top: 24px;">
              <canvas id="todoStatsChart"></canvas>
            </div>
            <p style="color:var(--text-secondary); font-size:13px; margin-top:16px;">
              Completion Rate measures tasks completed out of total tasks retrieved from active lists.
            </p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-disconnect-ticktick').addEventListener('click', handleDisconnect);

    // Filters event listeners
    const filterBtns = document.querySelectorAll('.todo-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeFilter = e.currentTarget.dataset.filter;
        renderActiveList();
      });
    });

    renderActiveList();
    renderChart(completedCount, pendingCount);
  }

  function renderChart(completed, pending) {
    charts.forEach(c => c.destroy());
    charts = [];

    const ctx = document.getElementById('todoStatsChart').getContext('2d');
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

  loadAndRenderTasks();
}
