const yts = require('yt-search');
const axios = require('axios');

// ── Shared config ─────────────────────────────────────────────────────────────
const REQ = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

// ── Retry helper ──────────────────────────────────────────────────────────────
const retry = async (fn, tries = 3) => {
    for (let i = 1; i <= tries; i++) {
        try { return await fn(); } catch (e) {
            if (i === tries) throw e;
            await new Promise(r => setTimeout(r, 1000 * i));
        }
    }
};

// ── Individual API callers ────────────────────────────────────────────────────

// Returns { download, title, thumbnail } or throws

const izumiByQuery = async (query) => {
    const res = await retry(() => axios.get(
        `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`,
        REQ
    ));
    if (res?.data?.result?.download) return {
        download: res.data.result.download,
        title:    res.data.result.title    || query,
        thumbnail: res.data.result.thumbnail || ''
    };
    throw new Error('Izumi/query: no download link');
};

const izumiByUrl = async (ytUrl) => {
    const res = await retry(() => axios.get(
        `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(ytUrl)}&format=mp3`,
        REQ
    ));
    if (res?.data?.result?.download) return {
        download:  res.data.result.download,
        title:     res.data.result.title    || '',
        thumbnail: res.data.result.thumbnail || ''
    };
    throw new Error('Izumi/url: no download link');
};

const yupraByUrl = async (ytUrl) => {
    const res = await retry(() => axios.get(
        `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`,
        REQ
    ));
    if (res?.data?.success && res?.data?.data?.download_url) return {
        download:  res.data.data.download_url,
        title:     res.data.data.title     || '',
        thumbnail: res.data.data.thumbnail || ''
    };
    throw new Error('Yupra: no download link');
};

const okatsuByUrl = async (ytUrl) => {
    const res = await retry(() => axios.get(
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`,
        REQ
    ));
    if (res?.data?.dl) return {
        download:  res.data.dl,
        title:     res.data.title || '',
        thumbnail: res.data.thumb || ''
    };
    throw new Error('Okatsu: no download link');
};

const eliteByUrl = async (ytUrl) => {
    const res = await retry(() => axios.get(
        `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(ytUrl)}&format=mp3`,
        REQ
    ));
    if (res?.data?.success && res?.data?.downloadURL) return {
        download:  res.data.downloadURL,
        title:     res.data.title || '',
        thumbnail: ''
    };
    throw new Error('EliteProTech: no download link');
};

// ── Master fallback chain ─────────────────────────────────────────────────────
const fetchAudio = async (query, ytUrl) => {
    const errors = [];

    // Try Izumi by query first — doesn't need a YouTube URL at all
    try { return await izumiByQuery(query); } catch (e) { errors.push(`[1] ${e.message}`); }

    // All remaining APIs need the YouTube URL
    if (ytUrl) {
        for (const [label, fn] of [
            ['[2] Izumi/url',    () => izumiByUrl(ytUrl)],
            ['[3] Yupra',        () => yupraByUrl(ytUrl)],
            ['[4] Okatsu',       () => okatsuByUrl(ytUrl)],
            ['[5] EliteProTech', () => eliteByUrl(ytUrl)]
        ]) {
            try { return await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); }
        }
    }

    console.error('[ PLAY ] All APIs failed:\n' + errors.join('\n'));
    throw new Error('All download APIs failed. Please try again later.');
};

// ── Plugin export ─────────────────────────────────────────────────────────────
module.exports = {
    cmd: 'play',
    alias: ['song', 'mp3', 'music'],
    desc: 'Search and download a song from YouTube',
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

        try {
            await m.react('🎵');

            // ── Step 1: Resolve video info ────────────────────────────────────
            let ytUrl   = null;
            let title   = query;
            let thumb   = 'https://files.catbox.moe/j9ia5c.png';
            let duration = 'N/A';
            let views   = 'N/A';

            const isDirectLink = query.includes('youtube.com/') || query.includes('youtu.be/');

            if (isDirectLink) {
                ytUrl = query;
            } else {
                const { videos } = await yts(query);
                if (!videos?.length) {
                    await m.react('❌');
                    return m.reply(`❌ No results found for *"${query}"*`);
                }
                const v = videos[0];
                ytUrl    = v.url;
                title    = v.title;
                thumb    = v.thumbnail || thumb;
                duration = v.timestamp || 'N/A';
                views    = v.views?.toLocaleString?.() || 'N/A';
            }

            // ── Step 2: Send info card ────────────────────────────────────────
            await conn.sendMessage(m.from, {
                image: { url: thumb },
                caption:
                    `🎧 *ᴘᴏᴘᴋɪᴅ ᴍᴜsɪᴄ ᴘʟᴀʏᴇʀ*\n\n` +
                    `🎶 *${title}*\n` +
                    `⏱️ *Duration:* ${duration}\n` +
                    `👁️ *Views:* ${views}\n\n` +
                    `⏳ _Downloading... please wait_\n\n` +
                    `> 𝖯𝗈𝗉𝗄𝗂𝖽 𝖬𝖽 𝖤𝗇𝗀ɪɴ𝖾 𝟤𝟢𝟤𝟨 🇰🇪`
            }, { quoted: m });

            // ── Step 3: Download via fallback chain ───────────────────────────
            const result = await fetchAudio(query, ytUrl);
            const finalTitle = result.title || title;

            // ── Step 4: Send audio ────────────────────────────────────────────
            await conn.sendMessage(m.from, {
                audio: { url: result.download },
                mimetype: 'audio/mpeg',
                fileName: `${finalTitle}.mp3`,
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: finalTitle,
                        body: 'POPKID-MD Music 🎵',
                        thumbnailUrl: result.thumbnail || thumb,
                        sourceUrl: ytUrl || '',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: m });

            await m.react('✅');

        } catch (err) {
            console.error('[ PLAY ] Fatal:', err.message);
            await m.react('❌');
            return m.reply(
                `❌ *Download Failed*\n\n` +
                `_All music APIs are currently unavailable. Please try again later._\n\n` +
                `> 𝖯𝗈𝗉𝗄𝗂𝖽 𝖬𝖽 𝟤𝟢𝟤𝟨 🇰🇪`
            );
        }
    }
};
