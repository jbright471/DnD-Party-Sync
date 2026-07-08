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

  // ---- Phase 12.1: Saving Throw on Automation Presets ----
  addColumnSafe('automation_presets', 'save_dc', 'INTEGER DEFAULT NULL');
  addColumnSafe('automation_presets', 'save_ability', 'TEXT DEFAULT NULL');
  addColumnSafe('automation_presets', 'save_on_pass_json', "TEXT DEFAULT NULL");

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
      roll_visibility TEXT NOT NULL DEFAULT 'public',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // ---- Phase 12.2: Encounter Templates ----
  addColumnSafe('encounters', 'maps_json', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'notes_json', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'automation_presets_json', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'difficulty', "TEXT DEFAULT NULL");
  addColumnSafe('encounters', 'tags', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'environment_json', "TEXT DEFAULT '[]'");

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

  // ---- Phase 15.0: Condition Duration Tracking ----
  addColumnSafe('session_states', 'condition_durations_json', "TEXT DEFAULT '{}'");

  // ---- Phase 15.0: Audit Log, Idempotency & Resource Authority ----
  addColumnSafe('effect_events', 'request_id', 'TEXT DEFAULT NULL');
  addColumnSafe('effect_events', 'description', 'TEXT DEFAULT NULL');
  addColumnSafe('effect_events', 'is_reversed', 'INTEGER DEFAULT 0');
  addColumnSafe('effect_events', 'reversed_by_event_id', 'INTEGER DEFAULT NULL');

  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_effect_events_request_id ON effect_events(request_id) WHERE request_id IS NOT NULL;`);
  } catch (_e) {}

  // Seed default resource permissions
  db.exec(`INSERT OR IGNORE INTO campaign_state (key, value) VALUES ('resource_permissions', '{"loot_claim":"open","cross_player_effects":"open","inventory_transfer":"open"}')`);

  // ---- Phase 15.1: Compendium — store full stats on spawned monsters ----
  addColumnSafe('initiative_tracker', 'stats_json', "TEXT DEFAULT NULL");

  // ---- Phase 16.0: AoE group tracking ----
  addColumnSafe('effect_events', 'group_id', 'TEXT DEFAULT NULL');

  // ---- Phase 17.0: Per-skill proficiency + weapon attacks ----
  addColumnSafe('characters', 'skill_proficiencies', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'save_proficiencies', "TEXT DEFAULT '{}'");
  addColumnSafe('characters', 'attacks', "TEXT DEFAULT '[]'");
  addColumnSafe('pending_saves', 'roll_visibility', "TEXT NOT NULL DEFAULT 'public'");

  // ---- Phase 18.0: Loot auction / Need-vs-Greed voting ----
  addColumnSafe('shared_loot', 'vote_state_json', "TEXT DEFAULT NULL");

  // ---- Phase 19.0: DM Prep Packs (Encounter Staging) ----
  addColumnSafe('encounters', 'maps_json', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'notes_json', "TEXT DEFAULT '[]'");
  addColumnSafe('encounters', 'automation_presets_json', "TEXT DEFAULT '[]'");
  addColumnSafe('automation_presets', 'encounter_id', "INTEGER DEFAULT NULL");

  // ---- Phase 20.0: Encounter Rollback (Snapshots) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS combat_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT NOT NULL,
      round       INTEGER NOT NULL,
      turn_index  INTEGER NOT NULL,
      state_json  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ---- Phase 21.0: Rollback Audit Log ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS combat_restore_audit (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id           INTEGER,
      action_type           TEXT NOT NULL, -- 'preview' or 'restore'
      dm_identity           TEXT DEFAULT 'DM',
      timestamp             TEXT NOT NULL DEFAULT (datetime('now')),
      changed_entities_json TEXT NOT NULL DEFAULT '[]',
      status                TEXT NOT NULL DEFAULT 'success'
    );
  `);

  // ---- Phase 22.0: Effect Presets & Import Guardrails ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS effect_presets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL, -- 'spell', 'condition', 'aura', 'item', 'environmental'
      effects_json TEXT NOT NULL DEFAULT '[]',
      description  TEXT DEFAULT '',
      is_locked    INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_imports (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id       INTEGER DEFAULT NULL, -- NULL for new imports
      player_name        TEXT DEFAULT 'Player',
      url                TEXT DEFAULT '',
      incoming_data_json TEXT NOT NULL,
      diff_json          TEXT NOT NULL DEFAULT '{}',
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ---- Phase 23.0: Active Features ----
  addColumnSafe('session_states', 'active_features_json', "TEXT DEFAULT '[]'");

  // Seed default effect presets
  const seedPresets = [
    {
      name: 'Bless',
      category: 'spell',
      effects_json: JSON.stringify([
        {
          type: 'buff',
          buffData: {
            name: 'Bless',
            modifierType: 'flatBonus',
            statAffected: 'all saves',
            modifierValue: '2.5',
            isConcentration: true,
            sourceName: 'Bless'
          }
        }
      ]),
      description: 'Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw.',
      is_locked: 1
    },
    {
      name: 'Haste',
      category: 'spell',
      effects_json: JSON.stringify([
        {
          type: 'buff',
          buffData: {
            name: 'Haste',
            modifierType: 'flatBonus',
            statAffected: 'ac',
            modifierValue: '2',
            isConcentration: true,
            sourceName: 'Haste'
          }
        }
      ]),
      description: 'Choose a willing creature. Speed is doubled, gains +2 bonus to AC, has advantage on Dex saving throws, and gains an additional action.',
      is_locked: 1
    },
    {
      name: 'Shield of Faith',
      category: 'spell',
      effects_json: JSON.stringify([
        {
          type: 'buff',
          buffData: {
            name: 'Shield of Faith',
            modifierType: 'flatBonus',
            statAffected: 'ac',
            modifierValue: '2',
            isConcentration: true,
            sourceName: 'Shield of Faith'
          }
        }
      ]),
      description: 'A shimmering field appears and surrounds a creature of your choice, granting it a +2 bonus to AC for the duration.',
      is_locked: 1
    },
    {
      name: 'Frightened',
      category: 'condition',
      effects_json: JSON.stringify([
        {
          type: 'condition',
          condition: 'Frightened'
        }
      ]),
      description: 'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight, and cannot willingly move closer to the source.',
      is_locked: 1
    },
    {
      name: 'Poisoned',
      category: 'condition',
      effects_json: JSON.stringify([
        {
          type: 'condition',
          condition: 'Poisoned'
        }
      ]),
      description: 'A poisoned creature has disadvantage on attack rolls and ability checks.',
      is_locked: 1
    }
  ];

  for (const preset of seedPresets) {
    const exists = db.prepare('SELECT 1 FROM effect_presets WHERE name = ?').get(preset.name);
    if (!exists) {
      db.prepare(`
        INSERT INTO effect_presets (name, category, effects_json, description, is_locked)
        VALUES (?, ?, ?, ?, ?)
      `).run(preset.name, preset.category, preset.effects_json, preset.description, preset.is_locked);
    }
  }

  console.log('[DB] Migrations complete.');
}

module.exports = { runMigrations };
