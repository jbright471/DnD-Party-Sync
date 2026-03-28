const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateHomebrewStats, parseItemDescriptionLLM, parseManualItemLLM } = require('../ollama');

// GET /api/homebrew — list all homebrew entities
router.get('/', (req, res) => {
    try {
        const entities = db.prepare('SELECT * FROM homebrew_entities ORDER BY created_at DESC').all();
        res.json(entities.map(e => ({ ...e, stats_json: JSON.parse(e.stats_json) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew/parse-item — extract ManualItemFormData from raw text via LLM
router.post('/parse-item', async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'text is required' });
    }
    try {
        const result = await parseManualItemLLM(text.trim());
        if (!result) {
            return res.status(502).json({ error: 'AI did not return a result. Is Ollama running?' });
        }
        // LLM returned an explicit error (not a D&D item, etc.)
        if (result.error) {
            return res.status(422).json({ error: result.error });
        }
        res.json(result);
    } catch (err) {
        console.error('[/api/homebrew/parse-item]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew/generate — send description to Ollama, return generated stats
router.post('/generate', async (req, res) => {
    const { entity_type, name, description } = req.body;
    if (!entity_type || !name || !description) {
        return res.status(400).json({ error: 'entity_type, name, and description required' });
    }

    try {
        const stats = await generateHomebrewStats(entity_type, name, description);
        if (!stats) {
            return res.status(502).json({ error: 'Ollama failed to generate stats. Is it running?' });
        }
        res.json({ entity_type, name, description, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew — save finalized entity to DB
router.post('/', async (req, res) => {
    const { entity_type, name, description, stats_json } = req.body;
    if (!entity_type || !name) {
        return res.status(400).json({ error: 'entity_type and name required' });
    }

    try {
        let finalStats = stats_json || {};

        // If it's an item and stats are minimal/missing, try to auto-parse the description
        if (entity_type === 'item' && (Object.keys(finalStats).length === 0 || finalStats.type === 'Wondrous item')) {
            console.log(`[Homebrew] Auto-parsing description for item: ${name}`);
            const extracted = await parseItemDescriptionLLM(name, description);
            if (extracted) {
                finalStats = { ...finalStats, ...extracted };
            }
        }

        const result = db.prepare(
            'INSERT INTO homebrew_entities (entity_type, name, description, stats_json) VALUES (?, ?, ?, ?)'
        ).run(entity_type, name, description || '', JSON.stringify(finalStats));

        const entity = db.prepare('SELECT * FROM homebrew_entities WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ ...entity, stats_json: JSON.parse(entity.stats_json) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/homebrew/:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM homebrew_entities WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew/assign — assign an entity to a character
router.post('/assign', (req, res) => {
    const { characterId, entityId } = req.body;
    if (!characterId || !entityId) {
        return res.status(400).json({ error: 'characterId and entityId required' });
    }

    try {
        const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
        const entity = db.prepare('SELECT * FROM homebrew_entities WHERE id = ?').get(entityId);

        if (!character) return res.status(404).json({ error: 'Character not found' });
        if (!entity) return res.status(404).json({ error: 'Homebrew entity not found' });

        let inventory = [];
        try {
            inventory = JSON.parse(character.homebrew_inventory || '[]');
        } catch (_e) { inventory = []; }

        const stats = JSON.parse(entity.stats_json || '{}');
        
        // Add the homebrew item to homebrew_inventory
        inventory.push({
            id: `homebrew-${entity.id}-${Date.now()}`,
            name: entity.name,
            description: entity.description,
            type: entity.entity_type,
            stats: stats,
            isHomebrew: true,
            equipped: false,
            quantity: 1
        });

        db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(
            JSON.stringify(inventory),
            characterId
        );

        res.json({ success: true, message: `Assigned ${entity.name} to ${character.name}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/homebrew/parse-item — parse a specific item in a character's inventory
router.post('/parse-item', async (req, res) => {
    const { characterId, itemId, name, description, isHomebrew } = req.body;
    
    try {
        console.log(`[AI] Parsing item description for ${name}...`);
        const stats = await parseItemDescriptionLLM(name, description);
        
        const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
        if (!character) return res.status(404).json({ error: 'Character not found' });

        if (isHomebrew) {
            let inventory = JSON.parse(character.homebrew_inventory || '[]');
            inventory = inventory.map(item => {
                if (item.id === itemId) return { ...item, stats };
                return item;
            });
            db.prepare('UPDATE characters SET homebrew_inventory = ? WHERE id = ?').run(JSON.stringify(inventory), characterId);
        } else {
            let inventory = JSON.parse(character.inventory || '[]');
            inventory = inventory.map((item, idx) => {
                const currentId = `inv-${idx}`;
                if (currentId === itemId || item.name === name) {
                    return { ...item, stats, equipped: true };
                }
                return item;
            });
            db.prepare('UPDATE characters SET inventory = ? WHERE id = ?').run(JSON.stringify(inventory), characterId);
        }

        res.json({ success: true, stats });
    } catch (err) {
        console.error('[AI] Parse failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
