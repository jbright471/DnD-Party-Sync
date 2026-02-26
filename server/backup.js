const db = require('./db');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.resolve(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 10;

/**
 * Uses better-sqlite3's native db.backup() API to guarantee
 * a clean, uncorrupted snapshot without stopping the server.
 */
async function backupDatabase() {
    try {
        // Ensure backup directory exists
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `dnd_backup_${timestamp}.db`);

        // Use SQLite's internal backup API via better-sqlite3
        await db.backup(backupPath);
        console.log(`[Backup] Database backed up to: ${backupPath}`);

        // Prune old backups — keep only the most recent MAX_BACKUPS
        pruneOldBackups();

        return backupPath;
    } catch (err) {
        console.error('[Backup] Error creating backup:', err.message);
        return null;
    }
}

function pruneOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('dnd_backup_') && f.endsWith('.db'))
            .map(f => ({
                name: f,
                path: path.join(BACKUP_DIR, f),
                time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // newest first

        if (files.length > MAX_BACKUPS) {
            const toRemove = files.slice(MAX_BACKUPS);
            for (const file of toRemove) {
                fs.unlinkSync(file.path);
                console.log(`[Backup] Pruned old backup: ${file.name}`);
            }
        }
    } catch (err) {
        console.error('[Backup] Error pruning backups:', err.message);
    }
}

module.exports = { backupDatabase };
