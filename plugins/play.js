const fetch = require('node-fetch');

const LEXCODE_API = 'https://api.lexcode.biz.id/api/dwn/ytplay';

module.exports = {
    cmd: 'play',
    alias: ['song', 'mp3', 'music'],
    desc: 'Download audio from YouTube via LexCode API',
    category: 'DOWNLOAD',

    async execute(conn, m, { text, args }) {
        const query = (text || args.join(' ')).trim();

        if (!query) {
            return m.reply(
                `🎵 *ᴘᴏᴘᴋɪᴅ ᴍᴜsɪᴄ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n` +
                `*Usage:* .play <song name or YouTube link>\n` +
                `*Example:* .play Rema Calm Down 🇰🇪`
            );
        }

        await m.react('🔍');

        // ── Step 1: Search ────────────────────────────────────────────────────
        let result;
        try {
            const res = await fetch(
                `${LEXCODE_API}?q=${encodeURIComponent(query)}`,
                {
                    timeout: 20000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.status || !json.result) throw new Error('No results from API');
            result = json.result;
        } catch (e) {
            await m.react('❌');
            return m.reply(`❌ *Search Failed*\n\n${e.message}`);
        }

        const {
            title    = 'Unknown',
            channel  = 'Unknown',
            views    = 'N/A',
            duration = 'N/A',
            thumbnail,
            url: ytUrl,
            download
        } = result;

        const audioUrl = download?.audio;
        if (!audioUrl) {
            await m.react('❌');
            return m.reply('❌ API returned no audio link. Please try another song.');
        }

        // ── Step 2: Send info card ────────────────────────────────────────────
        const caption =
            `🎧 *ᴘᴏᴘᴋɪᴅ ᴍᴜsɪᴄ ᴘʟᴀʏᴇʀ*\n\n` +
            `🎶 *${title}*\n` +
            `👤 *Channel:* ${channel}\n` +
            `⏱️ *Duration:* ${duration}\n` +
            `👁️ *Views:* ${views}\n` +
            `🔗 ${ytUrl || ''}\n\n` +
            `⏳ _Downloading audio... please wait_\n\n` +
            `> 𝖯𝗈𝗉𝗄𝗂𝖽 𝖬𝖽 𝖤𝗇𝗀ɪɴ𝖾 𝟤𝟢𝟤𝟨 🇰🇪`;

        try {
            if (thumbnail) {
                await conn.sendMessage(m.from, {
                    image: { url: thumbnail },
                    caption
                }, { quoted: m });
            } else {
                await m.reply(caption);
            }
        } catch (_) {}

        // ── Step 3: Download buffer ───────────────────────────────────────────
        let buffer;
        try {
            const dlRes = await fetch(audioUrl, {
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://www.youtube.com/'
                }
            });
            if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
            buffer = await dlRes.buffer();
        } catch (e) {
            await m.react('❌');
            return m.reply(`❌ *Download Failed*\n\n${e.message}`);
        }

        // ── Step 4: Send audio ────────────────────────────────────────────────
        const safeTitle = title.replace(/[^\w\s\-]/g, '').trim().slice(0, 60) || 'audio';
        try {
            await conn.sendMessage(m.from, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                fileName: `${safeTitle}.mp3`,
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: title,
                        body: 'POPKID-MD Music 🎵',
                        thumbnailUrl: thumbnail || '',
                        sourceUrl: ytUrl || '',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: m });

            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            return m.reply(`❌ *Failed to send audio*\n\n${e.message}`);
        }
    }
};
