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
  addColumnSafe('characters', 'token_image', "TEXT DEFAULT NULL");
  addColumnSafe('characters', 'raw_dndbeyond_json', "TEXT DEFAULT ''");
  addColumnSafe('characters', 'data_json', "TEXT DEFAULT '{}'"); // New Pivot Column
  addColumnSafe('characters', 'homebrew_inventory', "TEXT DEFAULT '[]'");
  addColumnSafe('characters', 'ddb_id', "INTEGER UNIQUE DEFAULT NULL");

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
      is_hidden     INTEGER NOT NULL DEFAULT 0,
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

  // Pivot: Volatile session state
  db.exec(`
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
  `);

  // ---- Phase 7: Map & VTT ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      image_path  TEXT, -- Path to file on disk
      grid_size   INTEGER DEFAULT 50,
      is_active   INTEGER DEFAULT 0,
      group_id    TEXT DEFAULT NULL, -- UUID for multi-level sets
      level_order INTEGER DEFAULT 0, -- Order of levels (0, 1, 2...)
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS map_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id       INTEGER NOT NULL,
      entity_id    TEXT NOT NULL, -- Links to character_id or instance_id
      entity_name  TEXT,
      entity_type  TEXT DEFAULT 'pc',
      x            INTEGER DEFAULT 0,
      y            INTEGER DEFAULT 0,
      is_hidden    INTEGER DEFAULT 0,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    -- ---- Phase 8: World Building ----
    CREATE TABLE IF NOT EXISTS npcs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      race         TEXT,
      description  TEXT,
      occupation   TEXT,
      location     TEXT,
      secrets      TEXT,
      notes        TEXT,
      stats_json   TEXT DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ---- Phase 9: Campaign Management ----
    CREATE TABLE IF NOT EXISTS quests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      description  TEXT,
      dm_secrets   TEXT,
      status       TEXT DEFAULT 'active', -- 'active', 'completed', 'failed'
      is_public    INTEGER DEFAULT 1,
      rewards      TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_state (
      key          TEXT PRIMARY KEY,
      value        TEXT
    );

    -- Initialize default time
    INSERT OR IGNORE INTO campaign_state (key, value) VALUES ('current_time', '{"day":1, "month":1, "year":1492, "hour":8, "minute":0}');
    INSERT OR IGNORE INTO campaign_state (key, value) VALUES ('current_weather', '{"condition":"Clear", "impact":"None"}');
  `);

  // ---- Phase 11: World Map Overworld ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_markers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_map_id INTEGER NOT NULL, -- The Overworld Map
      linked_map_id INTEGER,          -- The Battlemap it warps to
      name         TEXT NOT NULL,
      type         TEXT DEFAULT 'location', -- 'location', 'quest', 'encounter'
      x            INTEGER DEFAULT 0,
      y            INTEGER DEFAULT 0,
      is_discovered INTEGER DEFAULT 0, -- DM reveals this to players
      is_hidden    INTEGER DEFAULT 0, -- DM only
      FOREIGN KEY (parent_map_id) REFERENCES maps(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_map_id) REFERENCES maps(id) ON DELETE SET NULL
    );
  `);

  // ---- Phase 12.0: Effect Engine & Automation ----

  // Immutable event store — one row per discrete effect applied during combat
  db.exec(`
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
  `);

  // DM Automation presets — group actions, turn triggers, auras
  db.exec(`
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
  `);

  // ---- Phase 11.0: World Map & Voice ----
  addColumnSafe('maps', 'is_overworld', 'INTEGER DEFAULT 0');
  addColumnSafe('map_markers', 'description', "TEXT DEFAULT ''");

  // ---- Phase 14.0: Effect Locking ----
  addColumnSafe('automation_presets', 'is_locked', 'INTEGER DEFAULT 0');

  // ---- Phase 14.0: Pending Saves (Sync-Linked Dice Rolls) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_saves (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      dc           INTEGER NOT NULL DEFAULT 15,
      ability      TEXT NOT NULL DEFAULT 'wis',
      on_fail_json TEXT NOT NULL DEFAULT '[]',
      on_pass_json TEXT NOT NULL DEFAULT '[]',
      source       TEXT DEFAULT 'DM',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // ---- Phase 13.0: Effect Stream index ----
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_effect_events_target ON effect_events (target_id, target_type, session_round DESC);`);
  } catch (_e) {}

  // ---- Phase 13.1: DM Prep Notes ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS dm_prep_notes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      linked_type  TEXT NOT NULL DEFAULT 'general',
      linked_id    INTEGER DEFAULT NULL,
      title        TEXT NOT NULL DEFAULT 'Untitled',
      content      TEXT NOT NULL DEFAULT '',
      tags_json    TEXT NOT NULL DEFAULT '[]',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dm_prep_notes_link ON dm_prep_notes (linked_type, linked_id);
  `);

  // ---- Phase 14: Shared Party Loot Pool ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_loot (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      category    TEXT DEFAULT 'Gear',
      rarity      TEXT DEFAULT 'Common',
      stats_json  TEXT DEFAULT '{}',
      dropped_by  TEXT DEFAULT 'DM',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed DM token placeholder (real value set on first DM login)
  db.exec(`INSERT OR IGNORE INTO campaign_state (key, value) VALUES ('dm_token', '')`);

  console.log('[DB] Migrations complete.');
}

module.exports = { runMigrations };
