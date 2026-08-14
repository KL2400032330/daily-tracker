/**
 * dashboard.js — tasks and expenses logic for the dashboard page
 */

// ── Auth Guard ───────────────────────────────────────────────

let currentUser = null;

async function initDashboard() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/index.html');
      return;
    }
    currentUser = await res.json();
  } catch (_) {
    window.location.replace('/index.html');
    return;
  }

  // Set greeting
  document.getElementById('navUsername').textContent = currentUser.username;
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  document.getElementById('dashGreeting').textContent = `${greeting}, ${currentUser.username}!`;

  // Set default expense date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;

  // Wire up logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Load data
  await Promise.all([loadTasks(), loadExpenses()]);

  // Wire up task form
  document.getElementById('addTaskBtn').addEventListener('click', handleAddTask);
  document.getElementById('taskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  // Wire up expense form
  document.getElementById('addExpenseBtn').addEventListener('click', handleAddExpense);
}

// ── Logout ───────────────────────────────────────────────────

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) { /* ignore */ }
  window.location.replace('/index.html');
}

// ── Utility ─────────────────────────────────────────────────

function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // dateStr is YYYY-MM-DD; display as MMM D, YYYY
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showInlineError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.add('visible');
}

function hideInlineError(elementId) {
  const el = document.getElementById(elementId);
  el.textContent = '';
  el.classList.remove('visible');
}

// ── Tasks ────────────────────────────────────────────────────

let tasks = [];

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('Failed to load tasks');
    tasks = await res.json();
    renderTasks();
  } catch (err) {
    showInlineError('taskError', 'Failed to load tasks. Please refresh.');
  }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const emptyEl = document.getElementById('taskEmpty');
  const countEl = document.getElementById('taskCount');

  // Remove all task items (keep empty state node for reference)
  const existingItems = list.querySelectorAll('.task-item');
  existingItems.forEach(el => el.remove());

  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  countEl.textContent = `${total} task${total !== 1 ? 's' : ''} · ${done} done`;

  if (total === 0) {
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = !!task.done;
    checkbox.setAttribute('aria-label', `Mark "${task.text}" as ${task.done ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', () => handleToggleTask(task.id, checkbox.checked));

    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.setAttribute('aria-label', `Delete task "${task.text}"`);
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>`;
    deleteBtn.addEventListener('click', () => handleDeleteTask(task.id));

    li.appendChild(checkbox);
    li.appendChild(textSpan);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

async function handleAddTask() {
  hideInlineError('taskError');
  const input = document.getElementById('taskInput');
  const text = input.value.trim();

  if (!text) {
    showInlineError('taskError', 'Please enter a task description.');
    input.focus();
    return;
  }

  const btn = document.getElementById('addTaskBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const data = await res.json();
      showInlineError('taskError', data.error || 'Failed to add task.');
      return;
    }

    const newTask = await res.json();
    tasks.unshift(newTask);
    input.value = '';
    renderTasks();
    input.focus();
  } catch (err) {
    showInlineError('taskError', 'Network error. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

async function handleToggleTask(id, done) {
  const taskIndex = tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) return;

  // Optimistic update
  tasks[taskIndex].done = done ? 1 : 0;
  renderTasks();

  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done })
    });

    if (!res.ok) {
      // Revert optimistic update
      tasks[taskIndex].done = done ? 0 : 1;
      renderTasks();
      showInlineError('taskError', 'Failed to update task.');
    }
  } catch (err) {
    // Revert
    tasks[taskIndex].done = done ? 0 : 1;
    renderTasks();
    showInlineError('taskError', 'Network error. Please try again.');
  }
}

async function handleDeleteTask(id) {
  const taskIndex = tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) return;

  // Optimistic removal
  const removedTask = tasks.splice(taskIndex, 1)[0];
  renderTasks();

  try {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      // Revert
      tasks.splice(taskIndex, 0, removedTask);
      renderTasks();
      showInlineError('taskError', 'Failed to delete task.');
    }
  } catch (err) {
    tasks.splice(taskIndex, 0, removedTask);
    renderTasks();
    showInlineError('taskError', 'Network error. Please try again.');
  }
}

// ── Expenses ─────────────────────────────────────────────────

let expenses = [];
let totalSpent = 0;
let monthlyAverage = 0;

async function loadExpenses() {
  try {
    const res = await fetch('/api/expenses');
    if (!res.ok) throw new Error('Failed to load expenses');
    const data = await res.json();
    expenses = data.expenses;
    totalSpent = data.total;
    monthlyAverage = data.monthlyAverage;
    renderExpenses();
  } catch (err) {
    showInlineError('expenseError', 'Failed to load expenses. Please refresh.');
  }
}

function renderExpenses() {
  const tbody = document.getElementById('expenseBody');
  const countEl = document.getElementById('expenseCount');
  const emptyRow = document.getElementById('expenseEmpty');

  // Remove all expense rows (keep empty row)
  const existingRows = tbody.querySelectorAll('.expense-row');
  existingRows.forEach(el => el.remove());

  countEl.textContent = `${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`;
  document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);
  document.getElementById('monthlyAvg').textContent = formatCurrency(monthlyAverage);

  if (expenses.length === 0) {
    emptyRow.style.display = '';
    return;
  }

  emptyRow.style.display = 'none';

  expenses.forEach(exp => {
    const tr = document.createElement('tr');
    tr.className = 'expense-row';
    tr.dataset.id = exp.id;

    tr.innerHTML = `
      <td>${formatDate(exp.date)}</td>
      <td class="amount-cell">${formatCurrency(exp.amount)}</td>
      <td><span class="category-badge">${escapeHtml(exp.category)}</span></td>
      <td class="desc-cell" title="${escapeHtml(exp.description || '')}">${escapeHtml(exp.description || '—')}</td>
      <td>
        <button class="btn-delete" aria-label="Delete expense of ${formatCurrency(exp.amount)} for ${escapeHtml(exp.category)}">
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </td>
    `;

    tr.querySelector('.btn-delete').addEventListener('click', () => handleDeleteExpense(exp.id));
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    showInlineError('expenseError', 'Please enter a valid positive amount.');
    amountInput.focus();
    return;
  }
  if (!category) {
    showInlineError('expenseError', 'Please enter a category.');
    categoryInput.focus();
    return;
  }
  if (!date) {
    showInlineError('expenseError', 'Please select a date.');
    dateInput.focus();
    return;
  }

  const btn = document.getElementById('addExpenseBtn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(amount), category, description: description || null, date })
    });

    if (!res.ok) {
      const data = await res.json();
      showInlineError('expenseError', data.error || 'Failed to add expense.');
      return;
    }

    // Reload expenses to get updated totals
    amountInput.value = '';
    categoryInput.value = '';
    descriptionInput.value = '';
    // Keep the date for convenience

    await loadExpenses();
  } catch (err) {
    showInlineError('expenseError', 'Network error. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteExpense(id) {
  const idx = expenses.findIndex(e => e.id === id);
  if (idx === -1) return;

  // Optimistic removal
  const removed = expenses.splice(idx, 1)[0];
  // Recalculate totals optimistically
  totalSpent -= removed.amount;
  // Recalculate monthly average optimistically from remaining expenses
  const months = new Set(expenses.map(e => e.date.substring(0, 7)));
  monthlyAverage = months.size > 0 ? totalSpent / months.size : 0;
  renderExpenses();

  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      // Revert and reload accurate data
      await loadExpenses();
      showInlineError('expenseError', 'Failed to delete expense.');
    }
  } catch (err) {
    await loadExpenses();
    showInlineError('expenseError', 'Network error. Please try again.');
  }
}

// ── Boot ─────────────────────────────────────────────────────

initDashboard();
