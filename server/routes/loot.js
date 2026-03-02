const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateLootLLM } = require('../ollama');

// POST /api/loot/generate — Generate loot items
router.post('/generate', async (req, res) => {
    const { context } = req.body;
    if (!context) return res.status(400).json({ error: 'Context required' });

    try {
        const items = await generateLootLLM(context);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/loot/archive — Save item to Homebrew Library
router.post('/archive', (req, res) => {
    const { item } = req.body;
    if (!item) return res.status(400).json({ error: 'Item required' });

    try {
        const result = db.prepare(`
            INSERT INTO homebrew_entities (entity_type, name, description, stats_json)
            VALUES ('item', ?, ?, ?)
        `).run(item.name, item.description, JSON.stringify(item.stats || {}));
        
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/loot/give — Give item directly to character
router.post('/give', (req, res) => {
    const { characterId, item } = req.body;
    if (!characterId || !item) return res.status(400).json({ error: 'characterId and item required' });

    try {
        const char = db.prepare('SELECT inventory FROM characters WHERE id = ?').get(characterId);
        if (!char) return res.status(404).json({ error: 'Character not found' });

        let inventory = JSON.parse(char.inventory || '[]');
        inventory.push({
            id: `loot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: item.name,
            description: item.description,
            quantity: 1,
            equipped: false,
            isAttuned: false,
            stats: item.stats || {}
        });

        db.prepare('UPDATE characters SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), characterId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
