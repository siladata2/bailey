export const makeAntiDelete = ({ ev, sendMessage }) => {
    const msgStore = new Map();
    const MAX_CACHE = 500; // Batasi maksimal 500 pesan biar RAM Termux tetap irit

    // Simpan pesan masuk ke cache
    const saveMessageCache = (msg) => {
        if (!msg?.key?.id || !msg?.message) return;
        if (msg.key.fromMe) return;

        // Hapus data terlama kalo cache penuh
        if (msgStore.size >= MAX_CACHE) {
            const firstKey = msgStore.keys().next().value;
            msgStore.delete(firstKey);
        }
        msgStore.set(msg.key.id, msg);
    };

    // Ambil pesan yang dihapus berdasarkan ID
    const getDeletedMessage = (msgId) => {
        return msgStore.get(msgId) || null;
    };

    // Aktifkan listener Anti-Delete otomatis
    const enableAntiDelete = (options = {}) => {
        const {
            forwardTo = null, // Kosong = kirim balik ke chat asal, atau isi JID owner "628xxx@s.whatsapp.net"
            captionHeader = "🛡️ *ANTI-DELETE TERDETEKSI*\nPengirim: @{sender}\nPesan yang dihapus:"
        } = options;

        const upsertHandler = ({ messages }) => {
            for (const m of messages) {
                saveMessageCache(m);
            }
        };
        ev.on('messages.upsert', upsertHandler);

        const updateHandler = async (updates) => {
            for (const { key, update } of updates) {
                // Deteksi protokol REVOKE (Delete for Everyone)
                if (update?.messageStubType === 1 || update?.message === null) {
                    const cached = getDeletedMessage(key.id);
                    if (!cached) continue;

                    const targetJid = forwardTo || key.remoteJid;
                    const sender = key.participant || key.remoteJid;
                    const infoText = captionHeader.replace('{sender}', sender.split('@'));

                    await sendMessage(targetJid, {
                        text: infoText,
                        mentions: [sender]
                    }, { quoted: cached });

                    // Forward ulang isi pesan aslinya
                    await sendMessage(targetJid, { forward: cached });
                    msgStore.delete(key.id);
                }
            }
        };
        ev.on('messages.update', updateHandler);

        return () => {
            ev.off('messages.upsert', upsertHandler);
            ev.off('messages.update', updateHandler);
        };
    };

    return { saveMessageCache, getDeletedMessage, enableAntiDelete };
};
