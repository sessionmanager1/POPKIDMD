/**
 * POPKID MD - MASTER ENGINE 2026 (Unified Edition)
 * Features: Multi-Contact Status View/React, LID-Aware, Plugin Loader, Non-Prefix, Auto-Bio, Always Online
 * Creator: Popkid Kenya 🇰🇪
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    Browsers, 
    makeCacheableSignalKeyStore,
    getContentType 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib"); // Added for session decoding
const express = require("express");
const qrcode = require("qrcode-terminal");
const util = require("util");
const { exec } = require("child_process");
const axios = require("axios"); 

// Internal Libraries
const { sms } = require("./lib/serialize");
const { GroupEvents } = require("./lib/groupEvents"); 
const { AntilinkHandler } = require("./lib/antilinkHandler"); 
const { AntideleteHandler } = require("./lib/antidelete"); 
const { handleTagDetection } = require("./lib/tagDetector"); 
const { handleIncomingCall } = require("./lib/callHandler"); 
const config = require("./config");

const app = express();
const port = process.env.PORT || 8000;

// Global Map for Modular Plugins
global.plugins = new Map();

// ============ [ INTERNAL SESSION LOADER ] ============
async function loadSession(SESSION_ID, sessionDir) {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) return;
    if (!SESSION_ID || !SESSION_ID.startsWith('POPKID;;;')) {
        console.log('❌ Please add your session to SESSION_ID env !!');
        return;
    }
    const megaKey = SESSION_ID.replace('POPKID;;;', '');
    if (!megaKey) { console.log('❌ SESSION_ID is empty after prefix strip.'); return; }
    const { File } = require('megajs');
    console.log('[ 📥 ] Downloading session from MEGA...');
    await new Promise((resolve) => {
        const filer = File.fromURL(`https://mega.nz/file/${megaKey}`);
        filer.download((err, data) => {
            if (err) { console.log('❌ MEGA Session Download Failed:', err.message); return resolve(); }
            fs.writeFile(credsPath, data, () => {
                console.log('[ 📥 ] Session downloaded ✅');
                resolve();
            });
        });
    });
}

async function startPopkid() {
    console.clear();
    console.log("🚀 Starting POPKID-MD Master Engine...");

    // 1. SESSION MANAGEMENT
    const sessionDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    await loadSession(config.SESSION_ID, sessionDir);

    // 2. DYNAMIC PLUGIN LOADER
    const pluginsDir = path.join(__dirname, "plugins");
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);

    fs.readdirSync(pluginsDir).forEach((file) => {
        if (file.endsWith(".js")) {
            try {
                const plugin = require(path.join(pluginsDir, file));
                if (plugin.cmd) {
                    global.plugins.set(plugin.cmd, plugin);
                    console.log(`🧩 Plugin Loaded: ${plugin.cmd}`);
                }
            } catch (e) { console.error(`❌ Plugin Load Error [${file}]:`, e.message); }
        }
    });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    // 3. INITIALIZE SOCKET
    const conn = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop"),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        }
    });

    // 4. CONNECTION UPDATES
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === "close") {
            let reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startPopkid();
        } else if (connection === "open") {
            console.log("✅ POPKID MD: Successfully Connected to WhatsApp!");
            
            // Wrap sendMessage ONCE here (not on every message)
            const originalSendMessage = conn.sendMessage;
            conn.sendMessage = async (jid, content, options = {}) => {
                const lastMsg = conn._lastMsgKey;
                const newsletterContext = {
                    mentionedJid: lastMsg ? [lastMsg.participant || lastMsg.remoteJid] : [],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: config.NEWSLETTER_JID || '120363423997837331@newsletter',
                        newsletterName: config.OWNER_NAME || 'POPKID',
                        serverMessageId: 1
                    }
                };
                if (content.contextInfo) {
                    content.contextInfo = { ...newsletterContext, ...content.contextInfo };
                } else {
                    content.contextInfo = newsletterContext;
                }
                return originalSendMessage.apply(conn, [jid, content, options]);
            };

            // Non-blocking: run presence + newsletter + owner message in background
            (async () => {
                try {
                    if (config.ALWAYS_ONLINE === "true") {
                        await conn.sendPresenceUpdate('available');
                    }
                    await conn.newsletterFollow("120363423997837331@newsletter");
                    console.log("📡 Auto-followed Official Newsletter");
                } catch (err) { console.log("Newsletter follow verified."); }

                try {
                    const ownerJid = config.OWNER_NUMBER[0] + "@s.whatsapp.net";
                    await conn.sendMessage(ownerJid, { 
                        image: { url: "https://files.catbox.moe/j9ia5c.png" },
                        caption: `🚀 *POPKID-MD IS LIVE!* \n\nPrefix: ${config.PREFIX}\nNon-Prefix: ${config.NON_PREFIX}\nStatus View: ${config.AUTO_READ_STATUS}` 
                    });
                } catch (err) { console.log("Startup message error:", err.message); }
            })();
        }
    });

    conn.ev.on("creds.update", saveCreds);

    conn.ev.on('call', async (call) => await handleIncomingCall(conn, call));

    conn.ev.on('group-participants.update', async (anu) => {
        await GroupEvents(conn, anu);
    });

    // 5. THE ULTIMATE MESSAGE HANDLER
    conn.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            conn._lastMsgKey = mek.key;
            mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
            
            const from = mek.key.remoteJid;
            const type = getContentType(mek.message);

            if (from === 'status@broadcast') {
                try {
                    const shouldRead = config.AUTO_READ_STATUS === 'true';
                    const shouldReact = config.AUTO_REACT_STATUS === 'true';
                    const statusParticipant = mek.key.participant || mek.participant || mek.key.remoteJid;

                    if (statusParticipant && statusParticipant !== 'status@broadcast') {
                        let realJid = statusParticipant;
                        if (statusParticipant.endsWith('@lid')) {
                            const rawPn = mek.key?.participantPn || mek.key?.senderPn || mek.participantPn;
                            if (rawPn) {
                                realJid = rawPn.includes('@') ? rawPn : `${rawPn}@s.whatsapp.net`;
                            } else {
                                const resolved = await conn.getJidFromLid(statusParticipant).catch(() => null);
                                if (resolved) realJid = resolved;
                            }
                        }

                        const resolvedKey = { 
                            remoteJid: 'status@broadcast', 
                            id: mek.key.id, 
                            participant: realJid 
                        };

                        if (shouldRead) await conn.readMessages([resolvedKey]);
                        
                        if (shouldReact) {
                            const reactable = ['imageMessage', 'videoMessage', 'extendedTextMessage', 'conversation', 'audioMessage'];
                            if (reactable.includes(type)) {
                                let emojis = ['🧩', '🌸', '💫', '🫀', '🧿', '🤖', '🥰', '🗿', '💙', '🌝', '🖤', '💚']; 
                                const emojiPath = path.join(__dirname, './database/status_emojis.json');
                                if (fs.existsSync(emojiPath)) {
                                    const customEmojis = JSON.parse(fs.readFileSync(emojiPath));
                                    if (customEmojis.emojis && customEmojis.emojis.length > 0) {
                                        emojis = customEmojis.emojis;
                                    }
                                }
                                
                                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                                await conn.sendMessage(from, { 
                                    react: { key: resolvedKey, text: emoji } 
                                }, { 
                                    statusJidList: [realJid, conn.user.id.split(':')[0] + '@s.whatsapp.net'] 
                                });
                            }
                        }
                    }
                } catch (e) { console.error("Status Error:", e.message); }
                return; 
            }

            if (from !== 'status@broadcast' && !mek.key.fromMe) {
                if (config.AUTO_TYPING === "true") await conn.sendPresenceUpdate('composing', from);
                if (config.AUTO_RECORDING === "true") await conn.sendPresenceUpdate('recording', from);
                if (config.AUTO_READ === "true") await conn.readMessages([mek.key]);
                if (config.AUTO_REACT === "true") {
                    const reactEmojis = ['❤️', '🔥', '⚡', '🤖', '💎', '✨'];
                    const randReact = reactEmojis[Math.floor(Math.random() * reactEmojis.length)];
                    await conn.sendMessage(from, { react: { text: randReact, key: mek.key } });
                }
            }

            const m = sms(conn, mek); 
            await AntilinkHandler(conn, m, config.OWNER_NUMBER.includes(m.sender.split('@')[0]));
            await AntideleteHandler(conn, m);
            await handleTagDetection(conn, m);

            const body = m.body || '';
            const isCmd = body.startsWith(config.PREFIX);
            
            let command = '';
            let args = [];

            if (isCmd) {
                command = body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase();
                args = body.trim().split(/ +/).slice(1);
            } else if (config.NON_PREFIX === "true") {
                command = body.trim().split(' ').shift().toLowerCase();
                args = body.trim().split(/ +/).slice(1);
            }

            const text = args.join(' ');
            const pushname = m.pushName || 'User';
            const isOwner = config.OWNER_NUMBER.includes(m.sender.split('@')[0]) || m.fromMe;
            const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';

            if (isOwner) {
                if (body.startsWith("$")) {
                    try {
                        let evaled = await eval(`(async () => { ${body.slice(1)} })()`);
                        return m.reply(util.format(evaled));
                    } catch (e) { return m.reply(util.format(e)); }
                }
                if (body.startsWith("%")) {
                    exec(body.slice(1), (err, stdout) => {
                        if (err) return m.reply(util.format(err));
                        if (stdout) m.reply(stdout);
                    });
                }
            }

            const plugin = global.plugins.get(command) || [...global.plugins.values()].find(p => p.alias && p.alias.includes(command));
            
            if (config.BOT_OFF === "true" && !isOwner) return;

            if (plugin) {
                if (!isCmd && config.NON_PREFIX !== "true") return;
                if (plugin.isOwner && !isOwner) return m.reply("❌ Developer Restricted Command.");
                if (plugin.isGroup && !m.isGroup) return m.reply("❌ This is for Groups only.");
                
                if (plugin.isBotAdmin && m.isGroup) {
                    const groupMetadata = await conn.groupMetadata(from);
                    const bot = groupMetadata.participants.find(p => p.id === botNumber);
                    if (!bot || !bot.admin) return m.reply("❌ I need Admin permissions first.");
                }

                try {
                    await plugin.execute(conn, m, { text, args, isOwner, isGroup: m.isGroup, pushname });
                } catch (e) { console.error(`Plugin Execution Error [${command}]:`, e.message); }
            }

        } catch (e) { console.error("Event Handler Error:", e.message); }
    });

    // 6. AUTO-BIO UPDATER
    setInterval(async () => {
        if (config.AUTO_BIO === "true" && conn.user) {
            const time = new Date().toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour12: false });
            const bioText = `❤️ ᴘᴏᴘᴋɪᴅ xᴍᴅ ʙᴏᴛ ɪs ʟɪᴠᴇ ⏰ ${time} | Prefix: ${config.PREFIX}`;
            try { await conn.updateProfileStatus(bioText); } catch (err) {}
        }
    }, 60000);
}

// ============ [ DYNAMIC ANTI-SLEEP ENGINE ] ============
let selfUrl = "";

app.get("/", (req, res) => {
    // Automatically capture the URL on the first request
    if (!selfUrl) selfUrl = `${req.protocol}://${req.get('host')}`;
    res.send("POPKID-MD MASTER ENGINE ACTIVE ⚡");
});

setInterval(() => {
    if (selfUrl) {
        axios.get(selfUrl).then(() => {
            console.log("⚡ Anti-Sleep: Ping successful.");
        }).catch(() => {
            console.log("⚠️ Anti-Sleep: Ping failed, but server active.");
        });
    }
}, 300000); // 5 minutes

app.listen(port, () => startPopkid());
