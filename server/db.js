const sqlite = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Allow environment variable override for Docker volumes, default to local directory
const dbPath = process.env.DB_PATH || path.join(__dirname, 'dnd.db');

// Ensure directory exists if using a custom path
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = sqlite(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

module.exports = db;
