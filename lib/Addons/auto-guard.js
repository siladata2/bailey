export const makeAutoGuard = ({ ev, rejectCall, sendMessage, sendNode, sendPresenceUpdate, config = {} }) => {

    // 1. Auto Typing Simulation + Auto Read
    const enableAutoTyping = (options = {}) => {
        const cfg = typeof options === 'boolean' ? { enabled: options } : options;
        const {
            enabled = true,
            durationMs = cfg.typingDuration || 1200,
            autoRead = false
        } = cfg;

        if (!enabled) return false;

        const typingHandler = async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const m of messages) {
                if (!m.message || m.key.fromMe) continue;
                if (autoRead && sendNode && m.key.remoteJid) {
                    await sendNode({
                        tag: 'receipt',
                        attrs: {
                            id: m.key.id,
                            type: 'read',
                            to: m.key.remoteJid,
                            ...(m.key.participant ? { participant: m.key.participant } : {})
                        }
                    }).catch(() => {});
                }
                if (m.key.remoteJid) {
                    await sendPresenceUpdate('composing', m.key.remoteJid).catch(() => {});
                    setTimeout(() => sendPresenceUpdate('paused', m.key.remoteJid).catch(() => {}), durationMs);
                }
            }
        };
        ev.on('messages.upsert', typingHandler);

        return () => ev.off('messages.upsert', typingHandler);
    };

    // 2. Anti-Call Otomatis (Auto Tolak Telepon + Opsional Auto Block via sendNode)
    const enableAntiCall = (options = {}) => {
        const cfg = typeof options === 'boolean' ? { enabled: options } : options;
        const {
            enabled = true,
            autoBlock = false,
            warningText = "📵 *ANTI-CALL AKTIF*\nMaaf, nomor bot ini tidak menerima panggilan!"
        } = cfg;

        if (!enabled) return false;

        const callHandler = async (calls) => {
            for (const c of calls) {
                if (c.status === 'offer') {
                    await rejectCall(c.id, c.from).catch(() => {});
                    if (warningText) await sendMessage(c.from, { text: warningText }).catch(() => {});
                    if (autoBlock && sendNode) {
                        await sendNode({
                            tag: 'iq',
                            attrs: { xmlns: 'blocklist', type: 'set' },
                            content: [{ tag: 'item', attrs: { action: 'block', jid: c.from } }]
                        }).catch(() => {});
                    }
                }
            }
        };
        ev.on('call', callHandler);

        return () => ev.off('call', callHandler);
    };

    if (config.autoTyping) enableAutoTyping(config.autoTyping);
    if (config.antiCall) enableAntiCall(config.antiCall);

    return { enableAutoTyping, enableAntiCall };
};
