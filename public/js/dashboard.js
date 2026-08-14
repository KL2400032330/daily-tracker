/**
 * dashboard.js — tasks, expenses, and budget planner
 */

let currentUser = null;

async function initDashboard() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.replace('/index.html'); return; }
    currentUser = await res.json();
  } catch (_) { window.location.replace('/index.html'); return; }

  document.getElementById('navUsername').textContent = currentUser.username;
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  document.getElementById('dashGreeting').textContent = `${greeting}, ${currentUser.username}!`;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  await Promise.all([loadTasks(), loadExpenses(), loadBudgets()]);

  document.getElementById('addTaskBtn').addEventListener('click', handleAddTask);
  document.getElementById('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') handleAddTask(); });
  document.getElementById('addExpenseBtn').addEventListener('click', handleAddExpense);
  document.getElementById('addBudgetBtn').addEventListener('click', handleAddBudget);
}

async function handleLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  window.location.replace('/index.html');
}

// ── Utility ──────────────────────────────────────────────────

function formatCurrency(amount) {
  return '₹' + Number(amount).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showInlineError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add('visible');
}
function hideInlineError(id) {
  const el = document.getElementById(id);
  el.textContent = ''; el.classList.remove('visible');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Tasks ─────────────────────────────────────────────────────

let tasks = [];

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error();
    tasks = await res.json();
    renderTasks();
  } catch { showInlineError('taskError', 'Failed to load tasks. Please refresh.'); }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const emptyEl = document.getElementById('taskEmpty');
  list.querySelectorAll('.task-item').forEach(el => el.remove());

  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  document.getElementById('taskCount').textContent = `${total} task${total !== 1 ? 's' : ''} · ${done} done`;

  if (total === 0) { emptyEl.style.display = ''; return; }
  emptyEl.style.display = 'none';

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.dataset.id = task.id;

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'task-checkbox'; cb.checked = !!task.done;
    cb.setAttribute('aria-label', `Mark "${task.text}" as ${task.done ? 'incomplete' : 'complete'}`);
    cb.addEventListener('change', () => handleToggleTask(task.id, cb.checked));

    const span = document.createElement('span');
    span.className = 'task-text'; span.textContent = task.text;

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.setAttribute('aria-label', `Delete task "${task.text}"`);
    del.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    del.addEventListener('click', () => handleDeleteTask(task.id));

    li.append(cb, span, del);
    list.appendChild(li);
  });
}

async function handleAddTask() {
  hideInlineError('taskError');
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) { showInlineError('taskError', 'Please enter a task description.'); input.focus(); return; }

  const btn = document.getElementById('addTaskBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) { const d = await res.json(); showInlineError('taskError', d.error || 'Failed to add task.'); return; }
    tasks.unshift(await res.json());
    input.value = ''; renderTasks(); input.focus();
  } catch { showInlineError('taskError', 'Network error. Please try again.'); }
  finally { btn.disabled = false; }
}

async function handleToggleTask(id, done) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx].done = done ? 1 : 0; renderTasks();
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done })
    });
    if (!res.ok) { tasks[idx].done = done ? 0 : 1; renderTasks(); showInlineError('taskError', 'Failed to update task.'); }
  } catch { tasks[idx].done = done ? 0 : 1; renderTasks(); showInlineError('taskError', 'Network error.'); }
}

async function handleDeleteTask(id) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const removed = tasks.splice(idx, 1)[0]; renderTasks();
  try {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) { tasks.splice(idx, 0, removed); renderTasks(); showInlineError('taskError', 'Failed to delete task.'); }
  } catch { tasks.splice(idx, 0, removed); renderTasks(); showInlineError('taskError', 'Network error.'); }
}

// ── Expenses ──────────────────────────────────────────────────

let expenses = [], totalSpent = 0, monthlyAverage = 0;

async function loadExpenses() {
  try {
    const res = await fetch('/api/expenses');
    if (!res.ok) throw new Error();
    const data = await res.json();
    expenses = data.expenses; totalSpent = data.total; monthlyAverage = data.monthlyAverage;
    renderExpenses();
    renderBudgets();
  } catch { showInlineError('expenseError', 'Failed to load expenses. Please refresh.'); }
}

function renderExpenses() {
  const tbody = document.getElementById('expenseBody');
  const emptyRow = document.getElementById('expenseEmpty');
  tbody.querySelectorAll('.expense-row').forEach(el => el.remove());

  document.getElementById('expenseCount').textContent = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`;
  document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);
  document.getElementById('monthlyAvg').textContent = formatCurrency(monthlyAverage);

  if (expenses.length === 0) { emptyRow.style.display = ''; return; }
  emptyRow.style.display = 'none';

  expenses.forEach(exp => {
    const tr = document.createElement('tr');
    tr.className = 'expense-row'; tr.dataset.id = exp.id;
    tr.innerHTML = `
      <td>${formatDate(exp.date)}</td>
      <td class="amount-cell">${formatCurrency(exp.amount)}</td>
      <td><span class="category-badge">${escapeHtml(exp.category)}</span></td>
      <td class="desc-cell" title="${escapeHtml(exp.description || '')}">${escapeHtml(exp.description || '—')}</td>
      <td><button class="btn-delete" aria-label="Delete expense">
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button></td>`;
    tr.querySelector('.btn-delete').addEventListener('click', () => handleDeleteExpense(exp.id));
    tbody.appendChild(tr);
  });
}

async function handleAddExpense() {
  hideInlineError('expenseError');
  const amountInput = document.getElementById('expAmount');
  const categoryInput = document.getElementById('expCategory');
  const descriptionInput = document.getElementById('expDescription');
  const dateInput = document.getElementById('expDate');

  const amount = amountInput.value.trim();
  const category = categoryInput.value.trim();
  const description = descriptionInput.value.trim();
  const date = dateInput.value;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    showInlineError('expenseError', 'Please enter a valid positive amount.'); amountInput.focus(); return;
  }
  if (!category) { showInlineError('expenseError', 'Please enter a category.'); categoryInput.focus(); return; }
  if (!date) { showInlineError('expenseError', 'Please select a date.'); dateInput.focus(); return; }

  const btn = document.getElementById('addExpenseBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(amount), category, description: description || null, date })
    });
    if (!res.ok) { const d = await res.json(); showInlineError('expenseError', d.error || 'Failed to add expense.'); return; }
    amountInput.value = ''; categoryInput.value = ''; descriptionInput.value = '';
    await loadExpenses();
  } catch { showInlineError('expenseError', 'Network error. Please try again.'); }
  finally { btn.disabled = false; }
}

async function handleDeleteExpense(id) {
  const idx = expenses.findIndex(e => e.id === id);
  if (idx === -1) return;
  const removed = expenses.splice(idx, 1)[0];
  totalSpent -= removed.amount;
  const months = new Set(expenses.map(e => e.date.substring(0, 7)));
  monthlyAverage = months.size > 0 ? totalSpent / months.size : 0;
  renderExpenses(); renderBudgets();
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) { await loadExpenses(); showInlineError('expenseError', 'Failed to delete expense.'); }
  } catch { await loadExpenses(); showInlineError('expenseError', 'Network error.'); }
}

// ── Budget Planner ────────────────────────────────────────────

let budgets = [];

async function loadBudgets() {
  try {
    const res = await fetch('/api/budgets');
    if (!res.ok) throw new Error();
    budgets = await res.json();
    renderBudgets();
  } catch { showInlineError('budgetError', 'Failed to load budgets. Please refresh.'); }
}

function getSpentForItem(itemName) {
  // Match expenses whose category contains the budget item name (case-insensitive)
  return expenses
    .filter(e => e.category.toLowerCase().includes(itemName.toLowerCase()))
    .reduce((sum, e) => sum + e.amount, 0);
}

function renderBudgets() {
  const grid = document.getElementById('budgetGrid');
  const emptyEl = document.getElementById('budgetEmpty');
  grid.querySelectorAll('.budget-item').forEach(el => el.remove());

  let totalBudgeted = 0, totalBudgetSpent = 0;
  budgets.forEach(b => { totalBudgeted += b.amount; totalBudgetSpent += (b.spent || 0); });

  document.getElementById('budgetCount').textContent =
    `${budgets.length} item${budgets.length !== 1 ? 's' : ''} planned`;

  if (budgets.length === 0) { emptyEl.style.display = ''; updateBudgetSummary(0, 0); return; }
  emptyEl.style.display = 'none';

  budgets.forEach(b => {
    const spent = b.spent || 0;
    const pct = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0;
    const isOver = spent > b.amount;
    const isWarning = !isOver && pct >= 75;
    const statusClass = isOver ? 'over' : isWarning ? 'warning' : 'safe';
    const remaining = b.amount - spent;

    const div = document.createElement('div');
    div.className = 'budget-item';
    div.innerHTML = `
      <div class="budget-item-top">
        <div class="budget-item-name">${escapeHtml(b.item)}</div>
        <button class="btn-delete" aria-label="Delete ${escapeHtml(b.item)}">
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>

      <div class="budget-amounts-detail">
        <div class="budget-amount-pill pill-budgeted">
          <div class="pill-label">Budget</div>
          <div class="pill-value">${formatCurrency(b.amount)}</div>
        </div>
        <div class="budget-amount-pill pill-spent">
          <div class="pill-label">Spent</div>
          <div class="pill-value">${formatCurrency(spent)}</div>
        </div>
        <div class="budget-amount-pill pill-remaining ${remaining >= 0 ? 'positive' : 'negative'}">
          <div class="pill-label">${remaining >= 0 ? 'Remaining' : 'Over by'}</div>
          <div class="pill-value">${formatCurrency(Math.abs(remaining))}</div>
        </div>
      </div>

      <div class="budget-progress-bar" style="margin-top:10px">
        <div class="budget-progress-fill ${statusClass}" style="width:${pct}%"></div>
      </div>
      <div class="budget-item-status ${statusClass}" style="margin-top:5px">
        ${isOver
          ? `⚠ Over budget by ${formatCurrency(Math.abs(remaining))}`
          : isWarning
          ? `${formatCurrency(remaining)} remaining — almost at limit (${Math.round(pct)}% used)`
          : `${Math.round(pct)}% used · ${formatCurrency(remaining)} left`}
      </div>

      <div class="budget-spent-row">
        <input type="number" class="spent-input" placeholder="Add spent amount (₹)" min="0" step="0.01" />
        <button class="btn-log-spent">+ Log Spent</button>
      </div>`;

    div.querySelector('.btn-delete').addEventListener('click', () => handleDeleteBudget(b.id));
    div.querySelector('.btn-log-spent').addEventListener('click', () => {
      const input = div.querySelector('.spent-input');
      const val = parseFloat(input.value);
      if (!val || val < 0) { input.focus(); return; }
      handleUpdateSpent(b.id, spent + val);
      input.value = '';
    });

    grid.appendChild(div);
  });

  updateBudgetSummary(totalBudgeted, totalBudgetSpent);
}

function updateBudgetSummary(budgeted, spent) {
  document.getElementById('totalBudgeted').textContent = formatCurrency(budgeted);
  document.getElementById('budgetTotalSpent').textContent = formatCurrency(spent);
  const remaining = budgeted - spent;
  const remEl = document.getElementById('budgetRemaining');
  remEl.textContent = formatCurrency(Math.abs(remaining));
  remEl.style.color = remaining < 0 ? 'var(--danger)' : 'var(--success)';
  if (remaining < 0) remEl.textContent = '-' + formatCurrency(Math.abs(remaining));
}

async function handleAddBudget() {
  hideInlineError('budgetError');
  const itemInput = document.getElementById('budgetItem');
  const amountInput = document.getElementById('budgetAmount');

  const item = itemInput.value.trim();
  const amount = amountInput.value.trim();

  if (!item) { showInlineError('budgetError', 'Please enter an item name.'); itemInput.focus(); return; }
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    showInlineError('budgetError', 'Please enter a valid positive amount.'); amountInput.focus(); return;
  }

  const btn = document.getElementById('addBudgetBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/budgets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, amount: parseFloat(amount) })
    });
    if (!res.ok) { const d = await res.json(); showInlineError('budgetError', d.error || 'Failed to add budget item.'); return; }
    budgets.push(await res.json());
    itemInput.value = ''; amountInput.value = '';
    renderBudgets();
  } catch { showInlineError('budgetError', 'Network error. Please try again.'); }
  finally { btn.disabled = false; }
}

async function handleUpdateSpent(id, newSpent) {
  const idx = budgets.findIndex(b => b.id === id);
  if (idx === -1) return;
  const prev = budgets[idx].spent;
  budgets[idx].spent = newSpent;
  renderBudgets();
  try {
    const res = await fetch(`/api/budgets/${id}/spent`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spent: newSpent })
    });
    if (!res.ok) { budgets[idx].spent = prev; renderBudgets(); showInlineError('budgetError', 'Failed to update spent.'); }
    else { const updated = await res.json(); budgets[idx].spent = updated.spent; renderBudgets(); }
  } catch { budgets[idx].spent = prev; renderBudgets(); showInlineError('budgetError', 'Network error.'); }
}

async function handleDeleteBudget(id) {
  const idx = budgets.findIndex(b => b.id === id);
  if (idx === -1) return;
  const removed = budgets.splice(idx, 1)[0]; renderBudgets();
  try {
    const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    if (!res.ok) { budgets.splice(idx, 0, removed); renderBudgets(); showInlineError('budgetError', 'Failed to delete budget item.'); }
  } catch { budgets.splice(idx, 0, removed); renderBudgets(); showInlineError('budgetError', 'Network error.'); }
}

// ── Boot ──────────────────────────────────────────────────────
initDashboard();
