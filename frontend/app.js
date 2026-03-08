// ===========================
// 設定・認証チェック
// ===========================

const API = 'http://localhost:3001';

// トークンがなければログイン画面へ
const token = localStorage.getItem('token');
const email = localStorage.getItem('email');
if (!token) {
  location.href = 'login.html';
}

// ヘッダーにメールアドレスを表示
document.querySelector('.user-name').textContent = email || 'ユーザー';

let currentFilter = 'all';


// ===========================
// APIと通信（認証トークン付き）
// ===========================

// fetchに毎回トークンを付けるラッパー関数
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, // JWTトークンをヘッダーに付ける
      ...(options.headers || {}),
    },
  });

  // 401 = 未認証 → ログイン画面へ
  if (res.status === 401) {
    localStorage.clear();
    location.href = 'login.html';
  }

  return res;
}

async function loadTasks() {
  const res   = await apiFetch('/tasks');
  const tasks = await res.json();
  render(tasks);
}

async function addTask(text) {
  await apiFetch('/tasks', {
    method: 'POST',
    body:   JSON.stringify({ text }),
  });
  loadTasks();
}

async function toggleTask(id) {
  await apiFetch(`/tasks/${id}`, { method: 'PATCH' });
  loadTasks();
}

async function deleteTask(id) {
  await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
  loadTasks();
}


// ===========================
// 画面描画
// ===========================

function render(tasks) {
  const list      = document.getElementById('task-list');
  const remaining = document.getElementById('remaining');

  const filtered = tasks.filter(task => {
    if (currentFilter === 'active') return !task.done;
    if (currentFilter === 'done')   return task.done;
    return true;
  });

  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty">タスクがありません</li>';
  }

  filtered.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.innerHTML = `
      <input type="checkbox" class="task-check" ${task.done ? 'checked' : ''} data-id="${task.id}">
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="btn btn-danger btn-small" data-id="${task.id}">削除</button>
    `;
    list.appendChild(li);
  });

  remaining.textContent = tasks.filter(t => !t.done).length;
}


// ===========================
// イベント
// ===========================

document.getElementById('task-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('task-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  await addTask(text);
});

document.getElementById('task-list').addEventListener('click', async e => {
  if (e.target.classList.contains('task-check')) {
    await toggleTask(Number(e.target.dataset.id));
  }
  if (e.target.classList.contains('btn-danger')) {
    await deleteTask(Number(e.target.dataset.id));
  }
});

document.getElementById('clear-done').addEventListener('click', async () => {
  const res   = await apiFetch('/tasks');
  const tasks = await res.json();
  for (const t of tasks.filter(t => t.done)) {
    await apiFetch(`/tasks/${t.id}`, { method: 'DELETE' });
  }
  loadTasks();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentFilter = this.dataset.filter;
    loadTasks();
  });
});

// ログアウトボタン
document.querySelector('.user-name').addEventListener('click', () => {
  if (confirm('ログアウトしますか？')) {
    localStorage.clear();
    location.href = 'login.html';
  }
});
document.querySelector('.user-name').style.cursor = 'pointer';


// ===========================
// ユーティリティ
// ===========================

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ===========================
// 初期表示
// ===========================

loadTasks();
