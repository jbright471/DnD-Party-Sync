const db = require('./db');

function addColumnSafe(tableName, columnName, definition) {
  try {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    console.log(`[DB] Added column ${columnName} to ${tableName}`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.error(`[DB] Error adding column ${columnName}:`, err.message);
    }
  }
}

function runMigrations() {
  // ---- Phase 1 Core Tables ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      class       TEXT NOT NULL,
      level       INTEGER NOT NULL DEFAULT 1,
      max_hp      INTEGER NOT NULL,
      current_hp  INTEGER NOT NULL,
      ac          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp          TEXT NOT NULL DEFAULT (datetime('now')),
      actor              TEXT NOT NULL,
      action_description TEXT NOT NULL
    );
  `);

  // ---- Phase 2 Columns ----
  addColumnSafe('characters', 'spell_slots', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'conditions', "TEXT DEFAULT '[]'");
  addColumnSafe('characters', 'inspiration', "INTEGER DEFAULT 0");
  addColumnSafe('characters', 'concentration_spell', "TEXT DEFAULT NULL");
  addColumnSafe('characters', 'equipment', "TEXT DEFAULT '[]'");

  // ---- Phase 4: Full Character Sheet Data ----
  addColumnSafe('characters', 'stats', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'skills', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'features', "TEXT DEFAULT '[]'");
  addColumnSafe('characters', 'features_traits', "TEXT DEFAULT '[]'");
  addColumnSafe('characters', 'inventory', "TEXT DEFAULT '[]'");
  addColumnSafe('characters', 'spells', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'backstory', "TEXT DEFAULT ''");
  addColumnSafe('characters', 'raw_dndbeyond_json', "TEXT DEFAULT ''");

  addColumnSafe('action_log', 'status', "TEXT DEFAULT 'applied'");
  addColumnSafe('action_log', 'effects_json', "TEXT DEFAULT NULL");

  // ---- Phase 3 Column Additions ----
  addColumnSafe('action_log', 'session_id', "TEXT DEFAULT NULL");

  // ---- Phase 3 New Tables ----

  // Pre-built encounters for the DM
  db.exec(`
    CREATE TABLE IF NOT EXISTS encounters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      monsters    TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Active initiative order (cleared between combats)
  db.exec(`
    CREATE TABLE IF NOT EXISTS initiative_tracker (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_name   TEXT NOT NULL,
      entity_type   TEXT NOT NULL DEFAULT 'pc',
      initiative    INTEGER NOT NULL DEFAULT 0,
      current_hp    INTEGER NOT NULL DEFAULT 0,
      max_hp        INTEGER NOT NULL DEFAULT 0,
      ac            INTEGER NOT NULL DEFAULT 10,
      is_active     INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      character_id  INTEGER DEFAULT NULL,
      encounter_id  INTEGER DEFAULT NULL,
      instance_id   TEXT DEFAULT NULL
    );
  `);

  // LLM-generated narrative recaps
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_recaps (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL DEFAULT (datetime('now')),
      recap_text   TEXT NOT NULL,
      raw_log      TEXT DEFAULT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Collaborative quest/note tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS party_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL DEFAULT 'general',
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      updated_by  TEXT DEFAULT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // DM-created custom monsters, spells, items
  db.exec(`
    CREATE TABLE IF NOT EXISTS homebrew_entities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type  TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      stats_json   TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  console.log('[DB] Migrations complete.');
}

module.exports = { runMigrations };
