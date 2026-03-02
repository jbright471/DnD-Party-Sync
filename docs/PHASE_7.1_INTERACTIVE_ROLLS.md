# Phase 7.1: Interactive Dice Rolls & UI Intelligence

## Overview
Phase 7.1 focused on transforming the static Character Sheet into an interactive rolling tool. Players and DMs can now click on stats and skills to trigger real-time dice rolls that are synchronized across the entire party.

## Key Features

### 1. Click-to-Roll System
- **Attributes Tab**: Clicking any of the six major attribute blocks triggers a **Saving Throw** roll.
- **Skills Tab**: Clicking any skill row triggers an **Ability Check** for that specific skill.
- **Roll Logic**:
  - Automatically adds the correct Ability Modifier.
  - Detects and applies **Proficiency Bonuses** (+3 for current level).
  - Handles **Advantage** (rolls 2d20 and takes the highest).

### 2. D&D Beyond Integration
- **Modifier Parsing**: Dynamically parses the `raw_dndbeyond_json` to identify specific saving throw proficiencies and skill advantages.
- **PDF Fallback**: For characters imported via PDF, a secondary parsing layer extracts saving throw data from the `data_json` field.

### 3. Visual Indicators
- **Proficiency Dots**: Golden filled circles (`bg-dnd-gold`) indicate proficiency in a saving throw or skill.
- **Advantage Badges**: A green 'A' badge appears next to stats/skills where the character has a mechanical advantage.

### 4. Real-time logging
- All rolls are broadcast via Socket.io to the global **Session Log**.
- Logs show the character name, the total result, the type of roll, and the detailed math (e.g., `1d20+7` or `[18, 5]+7` for advantage).

## Technical Implementation
- **Component**: `CharacterSheetModal.jsx`
- **Logic**: Use of `React.useMemo` for efficient modifier extraction and `rollCheck` helper for centralized dice math.
- **Communication**: `log_action` socket event for party-wide synchronization.
