PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Users: الهوية فقط
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,          -- الاسم بعد التوحيد (يمنع التكرار)
  token      TEXT NOT NULL,                 -- جلسة الجهاز
  is_founder INTEGER NOT NULL DEFAULT 0,
  badge      TEXT,                          -- شارة خاصة يمنحها المؤسس
  banned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

-- Player Progress: التقدم التراكمي
CREATE TABLE IF NOT EXISTS player_progress (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp           INTEGER NOT NULL DEFAULT 0,
  level        INTEGER NOT NULL DEFAULT 1,
  games        INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,  -- مباريات انتهت بالمركز الأول
  first_places INTEGER NOT NULL DEFAULT 0,  -- جولات انتهت بالمركز الأول
  best_score   INTEGER NOT NULL DEFAULT 0   -- أعلى مجموع نقاط في مباراة
);

CREATE TABLE IF NOT EXISTS rooms (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'open', -- open | closed
  max_players  INTEGER NOT NULL,
  rounds_total INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  closed_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS rooms_open_code ON rooms(code) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS room_players (
  room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  left_at   INTEGER,
  banned    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  winner_id  INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rounds (
  id         INTEGER PRIMARY KEY,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  challenge  TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw      REAL,                             -- النتيجة الخام (NULL = غير محتسبة)
  points   INTEGER NOT NULL DEFAULT 0,
  flagged  INTEGER NOT NULL DEFAULT 0,       -- نتيجة غير منطقية رفضها السيرفر
  PRIMARY KEY (round_id, user_id)
);

-- Leaderboard: سطر واحد لكل لاعب في كل مباراة؛ اليومي/الأسبوعي/الدائم تُحسب منه مباشرة
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points     INTEGER NOT NULL,
  placement  INTEGER NOT NULL,
  xp_gained  INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS lb_time ON leaderboard_entries(created_at);
CREATE INDEX IF NOT EXISTS lb_user ON leaderboard_entries(user_id);
