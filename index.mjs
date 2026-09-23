import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { GoogleGenAI } from '@google/genai';
import pino from 'pino';

const ai = new GoogleGenAI({ apiKey: "AQ.Ab8RN6IYo-iuFnpnw8NBKETnHsC-RLcSCUWh2jPTW6lmKheMFQ" });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 جاري إعادة الاتصال...');
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ البوت شغال الآن كمساعد افتراضي لأبو الجود!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.imageMessage?.caption;

            if (!text) continue;

            const sender = msg.key.remoteJid;
            console.log(`📩 وصل كلام: "${text}"`);

            await sock.sendPresenceUpdate('composing', sender).catch(() => {});

            const promptText = `
أنت المساعد الافتراضي الخاص بـ (أبو الجود).
عرف عن نفسك بلطف أنك المساعد الافتراضي لأبو الجود، ورد باللهجة اليمنية العفوية والودية:
- رحب بالمتصل بحفاوة (حياك ربي، يا هلا والله، تسلم يا غالي...).
- وضح له أنك المساعد الافتراضي وأن أبو الجود مشغول حالياً أو خارج البيت وسيقوم بالرد عليه بنفسه فور تفرغه.
- إذا كان لديه رسالة أو استفسار، أخبره بأنك تسجلها لتبلغ أبو الجود بها.
- اجعل الرد خفيفاً ومباشراً (سطر إلى سطرين كحد أقصى).

الرسالة المرسلة: "${text}"
ردك كمساعد أبو الجود:
`;

            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-3.6-flash',
                    contents: promptText
                });

                const reply = response?.text ? response.text.trim() : "";

                if (reply) {
                    console.log(`💬 رد المساعد: ${reply}`);
                    await sock.sendMessage(sender, { text: reply });
                }
            } catch (err) {
                console.error("❌ خطأ:", err.message || err);
            } finally {
                sock.sendPresenceUpdate('paused', sender).catch(() => {});
            }
        }
    });
}

startBot();
