const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
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
} = require('@whiskeysockets/baileys');

const router = express.Router();

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

// Waits until creds.json actually exists on disk (max ~15s)
async function waitForCreds(credPath, retries = 10, interval = 1500) {
    for (let i = 0; i < retries; i++) {
        if (fs.existsSync(credPath)) return true;
        await delay(interval);
    }
    return false;
}

router.get('/', async (req, res) => {
    const id = makeid();
    let sessionSent = false; // guard: only send session once

    async function JUNEX() {
        const tempDir = path.join(process.cwd(), 'temp', id);
        const credPath = path.join(tempDir, 'creds.json');

        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
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
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60_000,
                keepAliveIntervalMs: 10_000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !res.headersSent) {
                    res.end(await QRCode.toBuffer(qr));
                }

                if (connection === 'open') {
                    if (sessionSent) return; // already handled
                    sessionSent = true;

                    try {
                        await client.sendMessage(client.user.id, {
                            text: '⚡ *Vesper-Xmd* ⚡\nGenerating your session, please wait a moment…'
                        });

                        // FIX: wait for creds.json to actually be written (was delay(50000) before!)
                        const ready = await waitForCreds(credPath);
                        if (!ready) throw new Error('creds.json was never written to disk');

                        await delay(1500); // tiny buffer for flush
                        const data = fs.readFileSync(credPath);
                        const b64data = Buffer.from(data).toString('base64');

                        const session = await client.sendMessage(client.user.id, {
                            text: 'VESPER-BOT:~' + b64data
                        });

                        await client.sendMessage(client.user.id, {
                            text: '```⚡ Vesper-Xmd has been linked to your WhatsApp!\n\n🔐 Do NOT share this session_id with anyone.\n\nCopy and paste it as your SESSION string during deploy.\n\nSupport: https://wa.me/message/256755585369\n\nGoodluck 🎉 — Vesper-Xmd```'
                        }, { quoted: session });

                        await delay(500);
                        await client.ws.close();
                        removeFile(tempDir);
                    } catch (e) {
                        console.error('[qr] Error sending session:', e.message);
                        removeFile(tempDir);
                    }

                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (!sessionSent && code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        JUNEX();
                    }
                }
            });

        } catch (err) {
            console.error('[qr] Service error:', err.message);
            if (!res.headersSent) res.json({ code: 'Service is Currently Unavailable' });
            removeFile(tempDir);
        }
    }

    return await JUNEX();
});

module.exports = router;
