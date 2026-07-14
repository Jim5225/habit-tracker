import { supabase } from '../supabase.js';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import Chart from 'chart.js/auto';

let charts = [];

export async function renderBudgetView(container) {
  const today = new Date();
  let selectedMonthStr = localStorage.getItem('budget_selected_month') || format(today, 'yyyy-MM');
  
  const selectMonths = Array.from({ length: 6 }).map((_, i) => {
    const d = subMonths(today, i);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy')
    };
  });

  async function loadData() {
    const selectedDate = parseISO(selectedMonthStr + '-01');
    const start = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(selectedDate), 'yyyy-MM-dd');

    // Fetch this month's Income & Expenses
    const { data: income } = await supabase.from('budget_income').select('*').gte('log_date', start).lte('log_date', end);
    const { data: expenses } = await supabase.from('budget_expenses').select('*').gte('log_date', start).lte('log_date', end);

    // Fetch this month's budget limit
    const { data: limitData } = await supabase.from('budget_limits').select('*').eq('month_str', selectedMonthStr);
    const budgetLimit = limitData && limitData.length > 0 ? Number(limitData[0].limit_amount) : 0;

    // Calculate totals
    const totalIncome = income?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    const totalExpenses = expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    const totalSavings = totalIncome - totalExpenses;
    const remainingBudget = budgetLimit - totalExpenses;

    // Fetch last month's data for comparison
    const prevMonthDate = subMonths(selectedDate, 1);
    const prevStart = format(startOfMonth(prevMonthDate), 'yyyy-MM-dd');
    const prevEnd = format(endOfMonth(prevMonthDate), 'yyyy-MM-dd');

    const { data: prevIncome } = await supabase.from('budget_income').select('*').gte('log_date', prevStart).lte('log_date', prevEnd);
    const { data: prevExpenses } = await supabase.from('budget_expenses').select('*').gte('log_date', prevStart).lte('log_date', prevEnd);

    const prevTotalIncome = prevIncome?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    const prevTotalExpenses = prevExpenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    const prevTotalSavings = prevTotalIncome - prevTotalExpenses;

    // Fetch last 6 months for comparative charts
    const historicalData = [];
    for (let i = 5; i >= 0; i--) {
      const histMonth = subMonths(selectedDate, i);
      const histStart = format(startOfMonth(histMonth), 'yyyy-MM-dd');
      const histEnd = format(endOfMonth(histMonth), 'yyyy-MM-dd');

      const { data: histInc } = await supabase.from('budget_income').select('amount').gte('log_date', histStart).lte('log_date', histEnd);
      const { data: histExp } = await supabase.from('budget_expenses').select('amount').gte('log_date', histStart).lte('log_date', histEnd);

      historicalData.push({
        label: format(histMonth, 'MMM yy'),
        income: histInc?.reduce((sum, item) => sum + Number(item.amount), 0) || 0,
        expense: histExp?.reduce((sum, item) => sum + Number(item.amount), 0) || 0
      });
    }

    renderUI(totalIncome, totalExpenses, totalSavings, prevTotalSavings, budgetLimit, remainingBudget, income, expenses, historicalData);
  }

  function renderUI(totalIncome, totalExpenses, totalSavings, prevTotalSavings, budgetLimit, remainingBudget, income, expenses, historicalData) {
    // Generate comparison text
    let savingsCompareText = '';
    if (prevTotalSavings === 0) {
      savingsCompareText = 'No savings data for last month to compare.';
    } else {
      const diff = totalSavings - prevTotalSavings;
      const pct = Math.round((diff / Math.abs(prevTotalSavings)) * 100);
      const direction = diff >= 0 ? 'increase' : 'decrease';
      const color = diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      savingsCompareText = `Your savings <span style="color:${color}; font-weight:bold;">${direction}d by ${Math.abs(pct)}%</span> ($${Math.abs(diff).toLocaleString()}) compared to last month.`;
    }

    // Progress bar details
    const percentSpent = budgetLimit > 0 ? Math.min(100, Math.round((totalExpenses / budgetLimit) * 100)) : 0;
    const progressClass = percentSpent >= 100 ? 'danger' : (percentSpent >= 80 ? 'warning' : 'safe');
    
    let limitStatusText = '';
    if (budgetLimit > 0) {
      if (remainingBudget >= 0) {
        limitStatusText = `You have spent <strong>${percentSpent}%</strong> of your budget. <strong>$${remainingBudget.toLocaleString()}</strong> remaining.`;
      } else {
        limitStatusText = `<span style="color:var(--accent-red); font-weight:bold;">Budget Overdraft!</span> You went over budget by <strong>$${Math.abs(remainingBudget).toLocaleString()}</strong>.`;
      }
    } else {
      limitStatusText = 'No budget limit set for this month yet. Set one below!';
    }

    const expenseCategories = [
      'Home Rent',
      'Electricity bills',
      'Wifi bill',
      'Utility bill',
      'Maintenance cost',
      'Grocery',
      'Shopping',
      "Wife's Special",
      'Jihan',
      'Other'
    ];

    container.innerHTML = `
      <div class="view-container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <h1>Monthly Budget Dashboard</h1>
          <div class="month-selector">
            <label for="budget-month-select" style="font-weight:600;">Select Month: </label>
            <select id="budget-month-select">
              ${selectMonths.map(m => `<option value="${m.value}" ${m.value === selectedMonthStr ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="budget-summary-grid">
          <div class="card summary-card">
            <h3>Total Income</h3>
            <div class="summary-value income">$${totalIncome.toLocaleString()}</div>
          </div>
          <div class="card summary-card">
            <h3>Total Expenses</h3>
            <div class="summary-value expense">$${totalExpenses.toLocaleString()}</div>
          </div>
          <div class="card summary-card">
            <h3>Net Savings</h3>
            <div class="summary-value savings">$${totalSavings.toLocaleString()}</div>
          </div>
        </div>

        <!-- Budget Limit & Progress -->
        <div class="card" style="margin-bottom: 24px;">
          <h2>Monthly Limit Analysis</h2>
          <p style="font-size:15px; margin-top:8px;">${limitStatusText}</p>
          ${budgetLimit > 0 ? `
            <div class="budget-progress-container">
              <div class="budget-progress-bar ${progressClass}" style="width: ${percentSpent}%;"></div>
            </div>
          ` : ''}
          <div style="display:flex; gap:12px; align-items:center; margin-top:16px;">
            <label for="budget-limit-input" style="font-weight:600; font-size:14px;">Set/Adjust Limit ($): </label>
            <input type="number" id="budget-limit-input" value="${budgetLimit || ''}" style="width:100px; padding:6px 10px; font-size:14px;" placeholder="e.g. 3000">
            <button id="btn-save-limit" style="padding:6px 16px; font-size:14px;">Save Limit</button>
          </div>
        </div>

        <!-- Insights -->
        <div class="card" style="margin-bottom: 32px;">
          <h2>Savings vs Last Month</h2>
          <p>${savingsCompareText}</p>
        </div>

        <!-- Visual Analytics Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
          <div class="card">
            <h2>Income vs Expense Trend</h2>
            <canvas id="budgetTrendChart" height="200"></canvas>
          </div>
          <div class="card">
            <h2>Expenses by Category</h2>
            <div style="max-height: 250px; display:flex; justify-content:center;">
              <canvas id="expenseCategoryChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Budget Forms & Logs Grid -->
        <div class="budget-grid">
          <!-- Inputs Column -->
          <div class="transaction-section">
            <div class="card">
              <h2>Add Income</h2>
              <form id="income-form">
                <div class="input-group">
                  <label for="inc-source">Source</label>
                  <input type="text" id="inc-source" placeholder="e.g. Salary, Freelance" required>
                </div>
                <div class="input-group">
                  <label for="inc-amount">Amount ($)</label>
                  <input type="number" id="inc-amount" placeholder="0.00" min="0" required>
                </div>
                <div class="input-group">
                  <label for="inc-date">Date</label>
                  <input type="date" id="inc-date" value="${format(today, 'yyyy-MM-dd')}" required>
                </div>
                <button type="submit">Save Income</button>
              </form>
            </div>

            <div class="card">
              <h2>Add Expense</h2>
              <form id="expense-form">
                <div class="input-group">
                  <label for="exp-category">Category</label>
                  <select id="exp-category" required>
                    <option value="" disabled selected>Select category</option>
                    ${expenseCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                  </select>
                </div>
                <div class="input-group">
                  <label for="exp-amount">Amount ($)</label>
                  <input type="number" id="exp-amount" placeholder="0.00" min="0" required>
                </div>
                <div class="input-group">
                  <label for="exp-date">Date</label>
                  <input type="date" id="exp-date" value="${format(today, 'yyyy-MM-dd')}" required>
                </div>
                <button type="submit" style="background: linear-gradient(135deg, var(--accent-orange), var(--accent-red));">Save Expense</button>
              </form>
            </div>
          </div>

          <!-- Transaction logs Column -->
          <div class="card transaction-section" style="overflow-x:auto;">
            <h2>Recent Transactions</h2>
            <table class="transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source/Category</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ...(income?.map(i => ({ ...i, type: 'income' })) || []),
                  ...(expenses?.map(e => ({ ...e, type: 'expense', source: e.category })) || [])
                ]
                  .sort((a, b) => b.log_date.localeCompare(a.log_date))
                  .map(t => `
                    <tr>
                      <td>${format(parseISO(t.log_date), 'MMM d')}</td>
                      <td>${t.source}</td>
                      <td>
                        <span class="category-badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">
                          ${t.type}
                        </span>
                      </td>
                      <td style="font-weight:600; color:${t.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'}">
                        $${Number(t.amount).toLocaleString()}
                      </td>
                      <td>
                        <button class="delete-btn" onclick="deleteTransaction('${t.type}', '${t.id}')">Delete</button>
                      </td>
                    </tr>
                  `).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No transactions logged this month.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('budget-month-select').addEventListener('change', (e) => {
      selectedMonthStr = e.target.value;
      localStorage.setItem('budget_selected_month', selectedMonthStr);
      loadData();
    });

    document.getElementById('btn-save-limit').addEventListener('click', async () => {
      const limit = parseFloat(document.getElementById('budget-limit-input').value) || 0;
      await supabase.from('budget_limits').upsert({
        month_str: selectedMonthStr,
        limit_amount: limit
      }, { onConflict: 'month_str' });
      loadData();
    });

    document.getElementById('income-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const source = document.getElementById('inc-source').value;
      const amount = parseFloat(document.getElementById('inc-amount').value);
      const log_date = document.getElementById('inc-date').value;

      await supabase.from('budget_income').insert({ source, amount, log_date });
      loadData();
    });

    document.getElementById('expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('exp-category').value;
      const amount = parseFloat(document.getElementById('exp-amount').value);
      const log_date = document.getElementById('exp-date').value;

      await supabase.from('budget_expenses').insert({ category, amount, log_date });
      loadData();
    });

    window.deleteTransaction = async (type, id) => {
      const table = type === 'income' ? 'budget_income' : 'budget_expenses';
      await supabase.from(table).delete().eq('id', id);
      loadData();
    };

    renderCharts(historicalData, expenses);
  }

  function renderCharts(historicalData, expenses) {
    charts.forEach(c => c.destroy());
    charts = [];

    const trendCtx = document.getElementById('budgetTrendChart').getContext('2d');
    charts.push(new Chart(trendCtx, {
      type: 'bar',
      data: {
        labels: historicalData.map(h => h.label),
        datasets: [
          { label: 'Income', data: historicalData.map(h => h.income), backgroundColor: '#10b981' },
          { label: 'Expenses', data: historicalData.map(h => h.expense), backgroundColor: '#ef4444' }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } }
        },
        plugins: { legend: { labels: { color: '#0f172a' } } }
      }
    }));

    const catCtx = document.getElementById('expenseCategoryChart').getContext('2d');
    const expenseDataMap = {};
    expenses?.forEach(exp => {
      expenseDataMap[exp.category] = (expenseDataMap[exp.category] || 0) + Number(exp.amount);
    });

    const categories = Object.keys(expenseDataMap);
    const categoryTotals = Object.values(expenseDataMap);

    const colors = [
      '#9333ea', '#06b6d4', '#f97316', '#10b981', '#ef4444',
      '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#6b7280'
    ];

    charts.push(new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: categoryTotals,
          backgroundColor: colors.slice(0, categories.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { color: '#0f172a', boxWidth: 12 } }
        }
      }
    }));
  }

  loadData();
}
