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
                        await delay(50000);
                        const data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                        await delay(8000);
                        const b64data = Buffer.from(data).toString('base64');
                        const session = await client.sendMessage(client.user.id, { text: 'VESPER-BOT:~' + b64data });
                        await client.sendMessage(client.user.id, {
                            text: "```⚡ Vesper-Xmd has been linked to your WhatsApp account!\n\nDo NOT share this session_id with anyone.\n\nCopy and paste it on the SESSION string during deploy — it will be used for authentication.\n\nFor any issues, reach us via:\nhttps://wa.me/message/256755585369\n\nDon't forget to sleep 😴, for even the relentless must recharge ⚡.\n\nGoodluck 🎉 — Vesper-Xmd```"
                        }, { quoted: session });
                        await delay(500);
                        await client.ws.close();
                        removeFile('./temp/' + id);
                    } catch (e) {
                        console.log('Error sending session messages:', e);
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
