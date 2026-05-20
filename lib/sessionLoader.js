const fs = require('fs');
const path = require('path');
const { File } = require('megajs');

/**
 * sessionLoader - Restores creds.json from MEGA using POPKID;;; session format
 * Format: SESSION_ID = "POPKID;;;<mega_file_key>"
 */
async function loadSession(sessionId, sessionDir) {
    const credsPath = path.join(sessionDir, 'creds.json');

    if (fs.existsSync(credsPath)) return true;

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    if (!sessionId || !sessionId.startsWith('POPKID;;;')) {
        console.log('❌ Invalid SESSION_ID — must start with POPKID;;;');
        return false;
    }

    const megaKey = sessionId.replace('POPKID;;;', '');
    if (!megaKey) {
        console.log('❌ SESSION_ID is empty after prefix strip.');
        return false;
    }

    console.log('[ 📥 ] Downloading session from MEGA...');

    return new Promise((resolve) => {
        const filer = File.fromURL(`https://mega.nz/file/${megaKey}`);
        filer.download((err, data) => {
            if (err) {
                console.log('❌ MEGA session download failed:', err.message);
                return resolve(false);
            }
            fs.writeFile(credsPath, data, (writeErr) => {
                if (writeErr) {
                    console.log('❌ Failed to write creds.json:', writeErr.message);
                    return resolve(false);
                }
                console.log('[ 📥 ] Session downloaded ✅');
                resolve(true);
            });
        });
    });
}

module.exports = { loadSession };
