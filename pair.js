const { makeid } = require('./id');
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

const router = express.Router();

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

// Standard base64 encoding function
function encodeToBase64(data) {
    // Convert Buffer to base64 with proper encoding
    return Buffer.from(data).toString('base64');
}

// Validate base64 string
function isValidBase64(str) {
    try {
        return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
        return false;
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function JUNEX() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });

            const client = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.ubuntu('Edge'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    try {
                        await client.sendMessage(client.user.id, {
                            text: '⚡ *Vesper-Xmd* ⚡\nGenerating your session, please wait a moment...'
                        });

                        await delay(3000);

                        // Read creds.json file
                        const credsPath = __dirname + `/temp/${id}/creds.json`;
                        const data = fs.readFileSync(credsPath);

                        // Encode to standard base64
                        const b64data = encodeToBase64(data);

                        // Validate base64 encoding
                        if (!isValidBase64(b64data)) {
                            throw new Error('Invalid base64 encoding generated');
                        }

                        // Split base64 into chunks for safe transmission
                        const chunkSize = 1000;
                        const chunks = [];
                        for (let i = 0; i < b64data.length; i += chunkSize) {
                            chunks.push(b64data.slice(i, i + chunkSize));
                        }

                        // Send base64 session with standard format
                        const sessionText = 'VESPER-BOT~' + b64data;
                        
                        // Send session as document for safety
                        const session = await client.sendMessage(client.user.id, {
                            text: sessionText
                        });

                        // Send instructions with session details
                        await client.sendMessage(client.user.id, {
                            text: `╭━━━✧ VESPER-XMD SESSION ✧━━━╮
┃
┃ ✅ *Session Generated Successfully!*
┃ 
┃ 📌 *Session Format:* VESPER-BOT~[base64]
┃ 📦 *Size:* ${(b64data.length / 1024).toFixed(2)} KB
┃ 🔐 *Encoded:* Base64 Standard
┃
┃ ⚠️ *IMPORTANT:*
┃ • Do NOT share this session with anyone
┃ • Copy the session string above
┃ • Paste it in your bot's SESSION_ID
┃
┃ 📱 *Need Help?*
┃ • wa.me/256742932677
┃
┃ *Stay connected with Vesper-Xmd!*
┃ 
╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
                        }, { quoted: session });

                        // Also send as document for easy copying
                        const b64Buffer = Buffer.from(sessionText, 'utf-8');
                        await client.sendMessage(client.user.id, {
                            document: b64Buffer,
                            mimetype: 'text/plain',
                            fileName: 'session_id.txt',
                            caption: '📄 *Session ID File*\n\nCopy this session string for deployment.'
                        });

                        await delay(500);
                        await client.ws.close();
                        removeFile('./temp/' + id);

                    } catch (e) {
                        console.log('Error sending session:', e);
                        try {
                            await client.sendMessage(client.user.id, {
                                text: `❌ *Session Generation Failed*\n\nError: ${e.message}\n\nPlease try again or contact support.`
                            });
                        } catch (err) {
                            console.log('Failed to send error message:', err);
                        }
                    }
                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        JUNEX();
                    }
                }
            });

            if (!client.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await client.requestPairingCode(num);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

        } catch (err) {
            console.log('Pair service error:', err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    await JUNEX();
});

module.exports = router;