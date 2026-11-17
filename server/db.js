import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Все запросы в проекте — подготовленные (prepare) с параметрами `?`/`$name`.
 * Пользовательские данные никогда не склеиваются со строкой SQL.
 */
const MIGRATIONS = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE credentials (
    id           TEXT PRIMARY KEY,
    public_key   BLOB NOT NULL,
    counter      INTEGER NOT NULL DEFAULT 0,
    transports   TEXT NOT NULL DEFAULT '[]',
    device_type  TEXT NOT NULL DEFAULT '',
    backed_up    INTEGER NOT NULL DEFAULT 0,
    name         TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
  ) STRICT;

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  ) STRICT;

  CREATE TABLE messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    ip_hash    TEXT NOT NULL,
    file_id    TEXT,
    file_name  TEXT,
    file_size  INTEGER,
    file_kind  TEXT
  ) STRICT;
  CREATE INDEX messages_created ON messages (created_at DESC);
  CREATE INDEX messages_ip ON messages (ip_hash, created_at);

  CREATE TABLE links (
    slug          TEXT PRIMARY KEY,
    url           TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    clicks        INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    last_click_at INTEGER
  ) STRICT;

  CREATE TABLE visitors (
    hash      TEXT PRIMARY KEY,
    first_day TEXT NOT NULL
  ) STRICT;

  CREATE TABLE visits (
    day     TEXT NOT NULL,
    visitor TEXT NOT NULL,
    PRIMARY KEY (day, visitor)
  ) STRICT, WITHOUT ROWID;
  `,
  `
  CREATE TABLE projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    year       INTEGER NOT NULL,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'Folder',
    href       TEXT NOT NULL,
    desc_ru    TEXT NOT NULL DEFAULT '',
    desc_en    TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  `,
]

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')

  const { user_version: current } = db.prepare('PRAGMA user_version').get()
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  return db
}

/** Выполняет fn в транзакции. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
