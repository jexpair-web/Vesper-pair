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

// Standard base64 encoding function
function encodeToBase64(data) {
    return Buffer.from(data).toString('base64');
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
                        await client.sendMessage(client.user.id, {
                            text: '⚡ *Vesper-Xmd* ⚡\nGenerating your session, please wait a moment...'
                        });

                        await delay(3000);

                        const credsPath = __dirname + `/temp/${id}/creds.json`;
                        let data = fs.readFileSync(credsPath);
                        let b64data = encodeToBase64(data);

                        // Send session with standard format
                        const sessionText = 'VESPER-BOT~' + b64data;
                        let session = await client.sendMessage(client.user.id, {
                            text: sessionText
                        });

                        await client.sendMessage(client.user.id, {
                            text: `╭━━━✧ VESPER-XMD SESSION ✧━━━╮
┃
┃ ✅ *Session Generated Successfully!*
┃ 
┃ 📌 *Format:* VESPER-BOT~[base64]
┃ 📦 *Size:* ${(b64data.length / 1024).toFixed(2)} KB
┃ 🔐 *Encoding:* Base64 Standard
┃
┃ ⚠️ *Keep this session private!*
┃
┃ 📱 *Support:* wa.me/256742932677
┃ 
╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
                        }, { quoted: session });

                        await delay(500);
                        await client.ws.close();
                        removeFile('./temp/' + id);

                    } catch (e) {
                        console.log('Error sending session:', e);
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