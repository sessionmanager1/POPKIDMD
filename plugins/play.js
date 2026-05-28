const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    cmd: 'play',
    alias: ['song', 'mp3', 'music'],
    desc: 'Search and download a song from YouTube',
    category: 'DOWNLOAD',
    async execute(conn, m, { text, args }) {
        const searchQuery = text || args.join(' ').trim();

        if (!searchQuery) {
            return m.reply(
                `🎵 *ᴘᴏᴘᴋɪᴅ ᴍᴜsɪᴄ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n` +
                `*Usage:* .play <song name>\n` +
                `*Example:* .play Rema Calm Down 🇰🇪`
            );
        }

        try {
            await m.react('🎵');

            // 1. Search YouTube
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await m.react('❌');
                return m.reply(`❌ No results found for *"${searchQuery}"*`);
            }

            const video = videos[0];
            const urlYt = video.url;
            const duration = video.timestamp || 'N/A';
            const views = video.views?.toLocaleString() || 'N/A';

            // 2. Notify user
            await m.reply(
                `⏳ *Downloading...*\n\n` +
                `🎶 *${video.title}*\n` +
                `⏱️ Duration: ${duration}\n` +
                `👁️ Views: ${views}\n\n` +
                `> 𝖯𝗈𝗉𝗄𝗂𝖽 𝖬𝖽 𝖤𝗇𝗀ɪɴ𝖾 𝟤𝟢𝟤𝟨 🇰🇪`
            );

            // 3. Fetch audio from API
            const response = await axios.get(
                `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(urlYt)}`,
                { timeout: 30000 }
            );
            const data = response.data;

            if (!data?.status || !data?.result?.downloadUrl) {
                await m.react('❌');
                return m.reply('❌ API failed to fetch audio. Please try again later.');
            }

            const audioUrl = data.result.downloadUrl;
            const title = data.result.title || video.title;

            // 4. Send audio
            await conn.sendMessage(m.from, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: title,
                        body: 'POPKID-MD Music 🎵',
                        thumbnailUrl: video.thumbnail || '',
                        sourceUrl: urlYt,
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: m });

            await m.react('✅');

        } catch (err) {
            console.error('Play Plugin Error:', err.message);
            await m.react('❌');
            return m.reply(`❌ *Download Failed*\n\n${err.message}`);
        }
    }
};
