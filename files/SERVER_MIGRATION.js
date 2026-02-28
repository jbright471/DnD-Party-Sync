// SERVER.JS MIGRATION GUIDE
// ============================================================
// This file shows exactly what to change in your existing server.js
// to wire in the new rules engine. Look for the "BEFORE" and "AFTER" blocks.
// ============================================================

// ============================================================
// STEP 1: Add import at the top of server.js
// ============================================================

// ADD this near the top with your other requires:
const {
  applyDamageEvent,
  applyHealEvent,
  setTempHpEvent,
  castConcentrationSpellEvent,
  dropConcentrationEvent,
  applyConditionEvent,
  removeConditionEvent,
  useSpellSlotEvent,
  shortRestEvent,
  longRestEvent,
  getResolvedCharacterState,
} = require('./lib/rulesIntegration');


// ============================================================
// STEP 2: Replace applyHpUpdate() in server.js
// ============================================================

// --- BEFORE ---
function applyHpUpdate_BEFORE(characterId, delta) {
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!char) return null;
  const newHp = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
  db.prepare('UPDATE characters SET current_hp = ? WHERE id = ?').run(newHp, char.id);
  return char;
}

// --- AFTER ---
// DELETE the old applyHpUpdate function entirely.
// The rules engine handles this now. See update_hp socket handler below.


// ============================================================
// STEP 3: Update the 'update_hp' socket handler
// ============================================================

// --- BEFORE ---
socket.on('update_hp_BEFORE', ({ characterId, delta, actor }) => {
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!char) return;

  const newHp = Math.max(0, Math.min(char.max_hp, char.current_hp + delta));
  const actionText = delta < 0
    ? `${char.name} took ${Math.abs(delta)} damage. (${newHp}/${char.max_hp} HP)`
    : `${char.name} was healed for ${delta} HP. (${newHp}/${char.max_hp} HP)`;

  if (isApprovalMode) {
    const effects = JSON.stringify({ type: 'hp', characterId, delta });
    logAction(actor || 'Player', actionText, 'pending', effects);
  } else {
    applyHpUpdate(characterId, delta);
    logAction(actor || 'System', actionText);
    broadcastPartyState();
  }
});

// --- AFTER ---
socket.on('update_hp', ({ characterId, delta, actor, damageType }) => {
  // delta > 0 = healing, delta < 0 = damage
  if (isApprovalMode) {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
    if (!char) return;
    const actionText = delta < 0
      ? `${char.name} takes ${Math.abs(delta)} ${damageType || 'untyped'} damage`
      : `${char.name} is healed for ${delta} HP`;
    const effects = JSON.stringify({ type: 'hp', characterId, delta, damageType });
    logAction(actor || 'Player', actionText, 'pending', effects);
    return;
  }

  let result;
  if (delta < 0) {
    // Damage — goes through the full rules engine (temp HP, resistance, conc check)
    result = applyDamageEvent(db, characterId, Math.abs(delta), damageType || 'untyped');
    if (result.concentrationCheck) {
      // Emit a concentration check prompt to the affected player
      io.emit('concentration_check_required', {
        characterId,
        spellName: result.concentratingOn,
        dc: result.concentrationCheck.dc,
      });
    }
  } else {
    // Healing
    result = applyHealEvent(db, characterId, delta);
  }

  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});


// ============================================================
// STEP 4: Add new socket handlers for rules engine events
// Add these inside the io.on('connection') block
// ============================================================

// --- Temp HP ---
socket.on('set_temp_hp', ({ characterId, amount, actor }) => {
  const result = setTempHpEvent(db, characterId, amount);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});

// --- Concentration ---
socket.on('cast_concentration_spell', ({ characterId, spellName, slotLevel, actor }) => {
  const result = castConcentrationSpellEvent(db, characterId, spellName, slotLevel ?? null);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  } else {
    socket.emit('rules_error', { message: result.error });
  }
});

socket.on('drop_concentration', ({ characterId, actor }) => {
  const result = dropConcentrationEvent(db, characterId);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});

// --- Conditions ---
socket.on('apply_condition', ({ characterId, condition, actor }) => {
  const result = applyConditionEvent(db, characterId, condition);
  if (result.success && !result.alreadyPresent) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});

socket.on('remove_condition', ({ characterId, condition, actor }) => {
  const result = removeConditionEvent(db, characterId, condition);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});

// --- Spell Slots ---
socket.on('use_spell_slot', ({ characterId, slotLevel, actor }) => {
  const result = useSpellSlotEvent(db, characterId, slotLevel);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  } else {
    socket.emit('rules_error', { message: result.error });
  }
});

// --- Rests ---
socket.on('short_rest', ({ characterId, actor }) => {
  const result = shortRestEvent(db, characterId);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});

socket.on('long_rest', ({ characterId, actor }) => {
  const result = longRestEvent(db, characterId);
  if (result.success) {
    logAction(actor || 'System', result.logMessage);
    broadcastPartyState();
  }
});


// ============================================================
// STEP 5: Update broadcastPartyState() to use resolved state
// ============================================================

// --- BEFORE ---
function broadcastPartyState_BEFORE() {
  let characters = getAllCharacters();
  characters = characters.map(char => {
    const { raw_dndbeyond_json, backstory, inventory, ...rest } = char;
    return rest;
  });
  io.emit('party_state', characters);
}

// --- AFTER ---
// Option A: Quick — just add temp HP to the existing broadcast:
function broadcastPartyState_OptionA() {
  let characters = getAllCharacters();
  characters = characters.map(char => {
    const { raw_dndbeyond_json, backstory, inventory, ...rest } = char;
    // Pull temp HP and resolved AC from session state
    const sessionRow = db.prepare('SELECT temp_hp, buffs_json, conditions_json FROM session_states WHERE character_id = ?').get(char.id);
    if (sessionRow) {
      rest.temp_hp = sessionRow.temp_hp;
      rest.conditions = JSON.parse(sessionRow.conditions_json || '[]');
    }
    return rest;
  });
  io.emit('party_state', characters);
}

// Option B: Full resolved state (recommended once frontend is updated):
function broadcastPartyState_OptionB() {
  const characters = getAllCharacters();
  const resolved = characters.map(char => {
    return getResolvedCharacterState(db, char.id) ?? char;
  });
  io.emit('party_state', resolved);
}

// ============================================================
// STEP 6: Update LLM effect applier to use rules engine
// ============================================================

// In your 'resolve_pending_action' and 'log_action' handlers,
// replace the applyHpUpdate/applyCharacterUpdate calls with:

function applyEffect_AFTER(effect) {
  if (effect.type === 'hp') {
    if (effect.delta < 0) {
      return applyDamageEvent(db, effect.characterId, Math.abs(effect.delta), effect.damageType || 'untyped');
    } else {
      return applyHealEvent(db, effect.characterId, effect.delta);
    }
  }
  if (effect.type === 'character') {
    // Handle the known update types with dedicated events
    const { updates, characterId } = effect;
    if (updates.conditions) {
      for (const cond of updates.conditions) {
        applyConditionEvent(db, characterId, cond);
      }
    }
    if (updates.concentration_spell !== undefined) {
      if (updates.concentration_spell) {
        castConcentrationSpellEvent(db, characterId, updates.concentration_spell);
      } else {
        dropConcentrationEvent(db, characterId);
      }
    }
    if (updates.spell_slots) {
      // updates.spell_slots is the full new slot state from LLM
      // Update session state directly for LLM-resolved slot changes
      const state = require('./lib/rulesIntegration').getSessionState(db, characterId);
      if (state) {
        state.spellSlotsUsed = updates.spell_slots;
        require('./lib/rulesIntegration').saveSessionState(db, state);
      }
    }
  }
}
