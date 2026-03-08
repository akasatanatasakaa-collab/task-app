require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const app        = express();
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// ===========================
// ミドルウェア
// ===========================

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://frontend-kappa-one-57.vercel.app',
  ],
}));
app.use(express.json());


// ===========================
// DB接続
// ===========================

// Render上ではDATABASE_URL、ローカルでは個別の環境変数を使う
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });


// ===========================
// 認証ミドルウェア
// リクエストのヘッダーにトークンがあれば検証する
// ===========================

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  // ヘッダーの形式: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId; // 後続の処理でユーザーIDを使えるようにする
    next();
  } catch {
    return res.status(401).json({ error: 'トークンが無効です' });
  }
}


// ===========================
// 認証 API
// ===========================

// POST /auth/register — 新規登録
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'メールアドレスとパスワードは必須です' });
  }

  // パスワードをハッシュ化（平文で保存しない）
  const hashed = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashed]
    );
    const user  = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, email: user.email });
  } catch (err) {
    if (err.code === '23505') { // UNIQUE違反
      return res.status(409).json({ error: 'このメールアドレスはすでに使われています' });
    }
    throw err;
  }
});

// POST /auth/login — ログイン
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user   = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
  }

  // 入力されたパスワードとDBのハッシュを比較
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, email: user.email });
});


// ===========================
// タスク API（認証必須）
// ===========================

// GET /tasks
app.get('/tasks', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE user_id = $1 ORDER BY id',
    [req.userId]
  );
  res.json(result.rows);
});

// POST /tasks
app.post('/tasks', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'text は必須です' });
  }
  const result = await pool.query(
    'INSERT INTO tasks (text, done, user_id) VALUES ($1, false, $2) RETURNING *',
    [text.trim(), req.userId]
  );
  res.status(201).json(result.rows[0]);
});

// PATCH /tasks/:id
app.patch('/tasks/:id', authMiddleware, async (req, res) => {
  const id     = Number(req.params.id);
  const result = await pool.query(
    'UPDATE tasks SET done = NOT done WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, req.userId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'タスクが見つかりません' });
  }
  res.json(result.rows[0]);
});

// DELETE /tasks/:id
app.delete('/tasks/:id', authMiddleware, async (req, res) => {
  const id     = Number(req.params.id);
  const result = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, req.userId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'タスクが見つかりません' });
  }
  res.status(204).send();
});


// ===========================
// サーバー起動
// ===========================

app.listen(PORT, () => {
  console.log(`サーバー起動中: http://localhost:${PORT}`);
});
