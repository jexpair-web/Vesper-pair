const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason,
} = require("@whiskeysockets/baileys");

let router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// Helper to wait for file to exist
async function waitForFile(filePath, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fs.existsSync(filePath)) {
            try {
                const stats = fs.statSync(filePath);
                if (stats.size > 0) return true;
            } catch (e) {}
        }
        await delay(1000);
    }
    return false;
}

router.get('/', async (req, res) => {
    const id = makeid();

    async function JUNEX() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });

            let client = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !res.headersSent) {
                    await res.end(await QRCode.toBuffer(qr));
                }

                if (connection === 'open') {
                    try {
                        const credsPath = __dirname + `/temp/${id}/creds.json`;
                        
                        // Wait for creds.json to be written
                        const fileExists = await waitForFile(credsPath);
                        
                        if (!fileExists) {
                            console.log('❌ creds.json not found after waiting');
                            await client.sendMessage(client.user.id, {
                                text: '⚠️ Failed to generate session. Please try again.'
                            });
                            await client.ws.close();
                            removeFile('./temp/' + id);
                            return;
                        }

                        // Send initial message
                        await client.sendMessage(client.user.id, {
                            text: '⚡ *Vesper-Xmd* ⚡\n✅ Session generated successfully!\n\n📥 Sending your session ID...'
                        });

                        // Read the file
                        const data = fs.readFileSync(credsPath);
                        const b64data = Buffer.from(data).toString('base64');
                        const sessionId = 'VESPER-BOT:~' + b64data;

                        // Send the session ID
                        const sessionMsg = await client.sendMessage(client.user.id, {
                            text: `🔐 *Your Session ID*\n\n\`\`\`${sessionId}\`\`\``
                        });

                        // Send instructions
                        await client.sendMessage(client.user.id, {
                            text: `╭━━━✧ *VESPER-XMD* ✧━━━╮
┃
┃ ✅ *Session Linked Successfully!*
┃ 
┃ 📌 *Format:* VESPER-BOT:~[base64]
┃ 🔐 *Encoded:* Base64 Standard
┃
┃ ⚠️ *IMPORTANT:*
┃ • Do NOT share this session with anyone
┃ • Copy the session string above
┃ • Paste it in your bot's SESSION_ID
┃
┃ 📱 *Need Help?*
┃ • wa.me/256755585369
┃
┃ *Stay connected with Vesper-Xmd!*
┃ 
╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
                        }, { quoted: sessionMsg });

                        await delay(1000);
                        await client.ws.close();
                        removeFile('./temp/' + id);
                        console.log('✅ Session sent successfully for:', client.user.id);

                    } catch (e) {
                        console.log('Error sending session messages:', e);
                        removeFile('./temp/' + id);
                    }
                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        JUNEX();
                    }
                }
            });

        } catch (err) {
            console.log('QR service error:', err);
            if (!res.headersSent) {
                await res.json({ code: 'Service is Currently Unavailable' });
            }
            removeFile('./temp/' + id);
        }
    }

    return await JUNEX();
});

module.exports = router;