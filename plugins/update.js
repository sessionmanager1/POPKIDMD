const axios = require("axios");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const { exec } = require("child_process");

module.exports = {
    cmd: "update",
    alias: ["upgrade", "patch"],
    desc: "Update bot to the latest version from GitHub",
    category: "OWNER",
    isOwner: true, // Restricted to you
    async execute(conn, m, { from, isOwner }) {
        try {
            // --- CONFIGURATION ---
            const repoOwner = "popkidke"; // Your GitHub Username
            const repoName = "GEMINI";           // Your Repo Name
            const branch = "main";
            
            const apiCommitUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${branch}`;
            const zipUrl = `https://github.com/${repoOwner}/${repoName}/archive/${branch}.zip`;
            const commitFile = path.join(process.cwd(), ".last_update_commit");

            await m.reply("🔍 *Checking for POPKID-MD updates...*");

            // 1. Fetch Latest Commit
            const { data: commitData } = await axios.get(apiCommitUrl, { 
                headers: { "User-Agent": "node.js" } 
            });
            const latestCommitHash = commitData.sha;

            // 2. Check current version
            let currentHash = null;
            if (fs.existsSync(commitFile)) {
                currentHash = fs.readFileSync(commitFile, "utf8").trim();
            }

            if (currentHash === latestCommitHash) {
                return m.reply("✅ *Your POPKID-MD is already up to date!*");
            }

            // 3. Inform User
            const commitMessage = commitData.commit.message || "No description";
            const updateMsg = `🚀 *POPKID-MD UPDATE FOUND!*\n\n` +
                              `📝 *Message:* ${commitMessage}\n` +
                              `📅 *Date:* ${new Date(commitData.commit.author.date).toLocaleString()}\n\n` +
                              `📥 *Downloading and installing patch...*`;
            await m.reply(updateMsg);

            // 4. Download & Extract
            const zipPath = path.join(process.cwd(), `temp_update.zip`);
            const tmpExtract = path.join(process.cwd(), "temp_update_folder");

            const zipRes = await axios.get(zipUrl, { 
                responseType: "arraybuffer", 
                headers: { "User-Agent": "node.js" } 
            });
            fs.writeFileSync(zipPath, zipRes.data);

            const zip = new AdmZip(zipPath);
            zip.extractAllTo(tmpExtract, true);

            // 5. Copy Files (Selective)
            const sourcePath = path.join(tmpExtract, `${repoName}-${branch}`);
            const destinationPath = process.cwd();

            // List of files to NEVER overwrite (to keep your session/config safe)
            const skipList = [
                "config.js", 
                "sessions", 
                "node_modules", 
                "package-lock.json", 
                ".env",
                "database"
            ];

            copyFolderSync(sourcePath, destinationPath, skipList);

            // 6. Save new Hash & Cleanup
            fs.writeFileSync(commitFile, latestCommitHash, "utf8");
            fs.unlinkSync(zipPath);
            fs.rmSync(tmpExtract, { recursive: true, force: true });

            await m.reply("✅ *Update Complete! Restarting Master Engine...*");

            // 7. Auto-Restart
            setTimeout(() => {
                process.exit(0); 
            }, 2000);

        } catch (error) {
            console.error(error);
            m.reply(`❌ *Update Failed!*\nError: ${error.message}`);
        }
    }
};

// Recursive Copy Helper
function copyFolderSync(source, target, skipList = []) {
    if (!fs.existsSync(source)) return;
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

    const items = fs.readdirSync(source);
    for (const item of items) {
        if (skipList.includes(item)) continue;

        const src = path.join(source, item);
        const dest = path.join(target, item);

        if (fs.lstatSync(src).isDirectory()) {
            copyFolderSync(src, dest, skipList);
        } else {
            fs.copyFileSync(src, dest);
        }
    }
}
