module.exports = {
    cmd: "restart",
    alias: ["reboot", "refresh"],
    desc: "Restart the bot engine",
    category: "OWNER",
    isOwner: true,
    async execute(conn, m) {
        const { exec } = require("child_process");
        await m.reply("🚀 *ʀᴇꜱᴛᴀʀᴛɪɴɢ ᴘᴏᴘᴋɪᴅ-ᴍᴅ...*\n_ᴘʟᴇᴀꜱᴇ ᴡᴀɪᴛ ᴀ ᴍᴏᴍᴇɴᴛ ꜰᴏʀ ᴛʜᴇ ᴇɴɢɪɴᴇ ᴛᴏ ʀᴇᴄᴏɴɴᴇᴄᴛ._");
        await m.react("🔄");
        
        // This command kills the process; your hosting (Heroku/VPS) 
        // will automatically start it again instantly.
        exec("pm2 restart all || index.js", (err) => {
            if (err) return process.exit();
        });
    }
};
