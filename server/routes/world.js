const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateWeatherLLM } = require('../ollama');
const { executePreparedHttpMutation } = require('../lib/httpMutationBoundary');

// GET /api/world/state
router.get('/state', (req, res) => {
    try {
        const time = db.prepare(`SELECT value FROM campaign_state WHERE key = 'current_time'`).get();
        const weather = db.prepare(`SELECT value FROM campaign_state WHERE key = 'current_weather'`).get();

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
        const timeRow = db.prepare(`SELECT value FROM campaign_state WHERE key = 'current_time'`).get();
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

        db.prepare(`UPDATE campaign_state SET value = ? WHERE key = 'current_time'`).run(JSON.stringify(time));

        res.json(time);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/world/weather — Generate new weather via dedicated JSON-mode function
router.post('/weather', async (req, res) => {
    const { climate } = req.body;

    try {
        const weather = await generateWeatherLLM(climate);
        if (!weather) {
            return res.status(502).json({ error: 'Ollama failed to generate weather. Is it running?' });
        }
        const outcome = executePreparedHttpMutation(db, req, {
            aggregateKeys: ['campaign:world'],
            commandType: 'world.weather.update',
            execute: () => {
                db.prepare(`UPDATE campaign_state SET value = ? WHERE key = 'current_weather'`).run(JSON.stringify(weather));
                return { success: true, weather };
            },
            buildDelta: () => ({ kind: 'world_weather_updated', scopes: ['world'] }),
            afterCommit: req.app.get('broadcastStateDelta'),
        });
        res.setHeader('X-Command-ID', outcome.commandId);
        res.setHeader('X-Campaign-Version', String(outcome.campaignVersion));
        res.json(outcome.result.weather);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
