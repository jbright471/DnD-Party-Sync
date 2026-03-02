const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateLoreLLM } = require('../ollama');

// GET /api/npcs — List all NPCs
router.get('/', (req, res) => {
    try {
        const npcs = db.prepare('SELECT * FROM npcs ORDER BY name ASC').all();
        res.json(npcs.map(n => ({ ...n, stats_json: JSON.parse(n.stats_json || '{}') })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/npcs/:id — Get specific NPC
router.get('/:id', (req, res) => {
    try {
        const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id);
        if (!npc) return res.status(404).json({ error: 'NPC not found' });
        res.json({ ...npc, stats_json: JSON.parse(npc.stats_json || '{}') });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/npcs — Create NPC
router.post('/', (req, res) => {
    const { name, race, description, occupation, location, secrets, notes, stats_json } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const result = db.prepare(`
            INSERT INTO npcs (name, race, description, occupation, location, secrets, notes, stats_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, race, description, occupation, location, secrets, notes, JSON.stringify(stats_json || {}));
        
        const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ ...npc, stats_json: JSON.parse(npc.stats_json) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/npcs/:id — Update NPC
router.patch('/:id', (req, res) => {
    const { name, race, description, occupation, location, secrets, notes, stats_json } = req.body;
    
    try {
        const current = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ error: 'NPC not found' });

        db.prepare(`
            UPDATE npcs SET 
                name = ?, race = ?, description = ?, occupation = ?, 
                location = ?, secrets = ?, notes = ?, stats_json = ?
            WHERE id = ?
        `).run(
            name || current.name,
            race !== undefined ? race : current.race,
            description !== undefined ? description : current.description,
            occupation !== undefined ? occupation : current.occupation,
            location !== undefined ? location : current.location,
            secrets !== undefined ? secrets : current.secrets,
            notes !== undefined ? notes : current.notes,
            stats_json ? JSON.stringify(stats_json) : current.stats_json,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM npcs WHERE id = ?').get(req.params.id);
        res.json({ ...updated, stats_json: JSON.parse(updated.stats_json) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/npcs/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM npcs WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/npcs/generate — AI generate NPC
router.post('/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    const systemPrompt = `You are a creative NPC generator for D&D 5e.
Generate a structured JSON response for an NPC.
Prompt: ${prompt}

Output format:
{
  "name": "string",
  "race": "string",
  "occupation": "string",
  "location": "string",
  "description": "Short visual description",
  "secrets": "DM only secret info",
  "notes": "General personality or lore notes",
  "stats": {"HP": number, "AC": number}
}
Return ONLY raw JSON.`;

    try {
        const response = await generateLoreLLM(systemPrompt);
        let parsed;
        try {
            parsed = JSON.parse(response);
        } catch (e) {
            const cleaned = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
            parsed = JSON.parse(cleaned);
        }
        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
