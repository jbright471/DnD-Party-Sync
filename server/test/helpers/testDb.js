'use strict';

/**
 * Creates a fully-migrated in-memory SQLite database for testing.
 *
 * Because schema.js imports the real db singleton at module load time, we
 * replicate the DDL here rather than calling runMigrations() directly.
 * This keeps tests hermetic — no files on disk, no shared state.
 */

const sqlite = require('better-sqlite3');

function createTestDb() {
  const db = sqlite(':memory:');
  db.pragma('journal_mode = WAL');

  // ── Core tables ─────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      class       TEXT NOT NULL DEFAULT 'Fighter',
      level       INTEGER NOT NULL DEFAULT 1,
      max_hp      INTEGER NOT NULL DEFAULT 20,
      current_hp  INTEGER NOT NULL DEFAULT 20,
      ac          INTEGER NOT NULL DEFAULT 15,
      spell_slots TEXT DEFAULT '{}',
      conditions  TEXT DEFAULT '[]',
      inspiration INTEGER DEFAULT 0,
      concentration_spell TEXT DEFAULT NULL,
      equipment   TEXT DEFAULT '[]',
      stats       TEXT DEFAULT '{}',
      skills      TEXT DEFAULT '{}',
      features    TEXT DEFAULT '[]',
      features_traits TEXT DEFAULT '[]',
      inventory   TEXT DEFAULT '[]',
      spells      TEXT DEFAULT '{}',
      backstory   TEXT DEFAULT '',
      token_image TEXT DEFAULT NULL,
      raw_dndbeyond_json TEXT DEFAULT '',
      data_json   TEXT DEFAULT '{}',
      homebrew_inventory TEXT DEFAULT '[]',
      ddb_id      INTEGER UNIQUE DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS session_states (
      character_id      INTEGER PRIMARY KEY,
      session_id        TEXT,
      current_hp        INTEGER,
      temp_hp           INTEGER DEFAULT 0,
      death_saves_json  TEXT DEFAULT '{"successes":0,"failures":0}',
      conditions_json   TEXT DEFAULT '[]',
      buffs_json        TEXT DEFAULT '[]',
      concentrating_on  TEXT DEFAULT NULL,
      slots_used_json   TEXT DEFAULT '{}',
      hd_used_json      TEXT DEFAULT '{}',
      feature_uses_json TEXT DEFAULT '{}',
      active_features_json TEXT DEFAULT '[]',
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS initiative_tracker (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_name   TEXT NOT NULL,
      entity_type   TEXT NOT NULL DEFAULT 'pc',
      initiative    INTEGER NOT NULL DEFAULT 0,
      current_hp    INTEGER NOT NULL DEFAULT 0,
      max_hp        INTEGER NOT NULL DEFAULT 0,
      ac            INTEGER NOT NULL DEFAULT 10,
      is_active     INTEGER NOT NULL DEFAULT 0,
      is_hidden     INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      character_id  INTEGER DEFAULT NULL,
      encounter_id  INTEGER DEFAULT NULL,
      instance_id   TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS effect_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      session_round    INTEGER NOT NULL DEFAULT 0,
      turn_index       INTEGER NOT NULL DEFAULT 0,
      phase            TEXT NOT NULL DEFAULT 'action',
      event_type       TEXT NOT NULL,
      actor            TEXT NOT NULL,
      target_id        INTEGER,
      target_type      TEXT NOT NULL DEFAULT 'character',
      target_name      TEXT,
      payload_json     TEXT NOT NULL DEFAULT '{}',
      parent_event_id  INTEGER DEFAULT NULL,
      source_preset_id INTEGER DEFAULT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_event_id) REFERENCES effect_events(id)
    );

    CREATE TABLE IF NOT EXISTS automation_presets (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL,
      preset_type           TEXT NOT NULL DEFAULT 'group_action',
      trigger_phase         TEXT DEFAULT NULL,
      trigger_entity_id     INTEGER DEFAULT NULL,
      effects_json          TEXT NOT NULL DEFAULT '[]',
      targets_json          TEXT NOT NULL DEFAULT '"party"',
      is_active             INTEGER NOT NULL DEFAULT 1,
      aura_radius           INTEGER DEFAULT NULL,
      aura_center_entity_id INTEGER DEFAULT NULL,
      description           TEXT DEFAULT '',
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp          TEXT NOT NULL DEFAULT (datetime('now')),
      actor              TEXT NOT NULL,
      action_description TEXT NOT NULL,
      status             TEXT DEFAULT 'applied',
      effects_json       TEXT DEFAULT NULL,
      session_id         TEXT DEFAULT NULL
    );
  `);

  return db;
}

/**
 * Insert a minimal character row and its session state.
 * Returns the inserted character's id.
 *
 * @param {object} db
 * @param {object} [overrides] - Partial character fields to override defaults
 */
function insertCharacter(db, overrides = {}) {
  const defaults = {
    name: 'Test Hero',
    class: 'Fighter',
    level: 5,
    max_hp: 40,
    current_hp: 40,
    ac: 16,
    data_json: JSON.stringify({
      baseMaxHp: overrides.max_hp ?? 40,
      baseAc: overrides.ac ?? 16,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      spellSlots: {},
      features: [],
      skills: {},
      resistances: overrides.resistances ?? [],
      immunities: overrides.immunities ?? [],
      vulnerabilities: overrides.vulnerabilities ?? [],
      ...overrides.data_json_extra,
    }),
  };

  const merged = { ...defaults, ...overrides };
  delete merged.resistances;
  delete merged.immunities;
  delete merged.vulnerabilities;
  delete merged.data_json_extra;

  const result = db.prepare(`
    INSERT INTO characters (name, class, level, max_hp, current_hp, ac, data_json)
    VALUES (@name, @class, @level, @max_hp, @current_hp, @ac, @data_json)
  `).run(merged);

  const id = result.lastInsertRowid;

  // Seed a default session state
  db.prepare(`
    INSERT INTO session_states (character_id, current_hp, temp_hp)
    VALUES (?, ?, 0)
  `).run(id, merged.current_hp);

  return id;
}

/**
 * Insert a monster into initiative_tracker.
 * Returns the inserted row's id.
 */
function insertMonster(db, overrides = {}) {
  const defaults = {
    entity_name: 'Goblin',
    entity_type: 'monster',
    current_hp: 15,
    max_hp: 15,
    ac: 12,
    initiative: 8,
    is_active: 0,
  };
  const merged = { ...defaults, ...overrides };
  const result = db.prepare(`
    INSERT INTO initiative_tracker (entity_name, entity_type, current_hp, max_hp, ac, initiative, is_active)
    VALUES (@entity_name, @entity_type, @current_hp, @max_hp, @ac, @initiative, @is_active)
  `).run(merged);
  return result.lastInsertRowid;
}

module.exports = { createTestDb, insertCharacter, insertMonster };
