const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateLoreLLM } = require('../ollama');

// GET /api/world/state
router.get('/state', (req, res) => {
    try {
        const time = db.prepare('SELECT value FROM campaign_state WHERE key = "current_time"').get();
        const weather = db.prepare('SELECT value FROM campaign_state WHERE key = "current_weather"').get();
        
        res.json({
            time: JSON.parse(time?.value || '{}'),
            weather: JSON.parse(weather?.value || '{}')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/world/advance-time — Add minutes
router.post('/advance-time', (req, res) => {
    const { minutes } = req.body;
    if (!minutes) return res.status(400).json({ error: 'Minutes required' });

    try {
        const timeRow = db.prepare('SELECT value FROM campaign_state WHERE key = "current_time"').get();
        let time = JSON.parse(timeRow.value);

        time.minute += minutes;
        while (time.minute >= 60) {
            time.minute -= 60;
            time.hour += 1;
        }
        while (time.hour >= 24) {
            time.hour -= 24;
            time.day += 1;
        }
        // Simplified calendar (30 days/month)
        while (time.day > 30) {
            time.day -= 30;
            time.month += 1;
        }
        while (time.month > 12) {
            time.month -= 12;
            time.year += 1;
        }

        db.prepare('UPDATE campaign_state SET value = ? WHERE key = "current_time"').run(JSON.stringify(time));
        
        res.json(time);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/world/weather — Generate new weather
router.post('/weather', async (req, res) => {
    const { climate } = req.body; // e.g. "Coastal", "Arctic", "Desert"
    
    const systemPrompt = `You are a D&D 5e weather engine.
Generate a weather condition for a ${climate || 'Temperate'} climate.
Return ONLY JSON:
{
  "condition": "string (e.g. Heavy Rain, Blistering Heat)",
  "impact": "Mechanical effect (e.g. Disadvantage on Perception)",
  "flavor": "Short atmospheric description"
}`;

    try {
        const response = await generateLoreLLM(systemPrompt);
        let parsed;
        try {
            parsed = JSON.parse(response);
        } catch (e) {
            const cleaned = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
            parsed = JSON.parse(cleaned);
        }

        db.prepare('UPDATE campaign_state SET value = ? WHERE key = "current_weather"').run(JSON.stringify(parsed));
        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
