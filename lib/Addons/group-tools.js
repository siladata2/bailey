import { generateWAMessage, generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import crypto from 'crypto';

const parseDelayMs = (timeStr) => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return timeStr * 1000;
    const match = String(timeStr).trim().match(/^(\d+)\s*([hmd])?$/i);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').toLowerCase();
    if (unit === 'h') return val * 86400 * 1000;
    if (unit === 'm') return val * 60 * 1000;
    return val * 1000;
};

export const makeGroupTools = ({ groupMetadata, sendMessage, relayMessage, waUploadToServer, userJid }) => {
    const mentionAll = async (jid, content = {}, options = {}) => {
        if (!jid.endsWith('@g.us')) throw new Error("Khusus grup mass!");
        const meta = await groupMetadata(jid);
        const participants = meta.participants.map(p => p.id);
        const payload = typeof content === 'string'
            ? { text: content, mentions: participants }
            : { ...content, mentions: participants };
        return sendMessage(jid, payload, options);
    };

    const scheduleMessage = (jid, content = {}, delay = "1m", options = {}) => {
        const ms = parseDelayMs(delay);
        const timer = setTimeout(() => sendMessage(jid, content, options).catch(() => {}), ms);
        return { cancel: () => clearTimeout(timer), executeAt: new Date(Date.now() + ms) };
    };

    const sendStatusMention = async (groupJids = [], content = {}) => {
        const jids = Array.isArray(groupJids) ? groupJids : [groupJids];
        const statusJidList = new Set([userJid]);
        for (const gJid of jids) {
            if (gJid.endsWith('@g.us')) {
                const meta = await groupMetadata(gJid);
                meta.participants.forEach(p => statusJidList.add(p.id));
            }
        }
        const msg = await generateWAMessage('status@broadcast', content, { upload: waUploadToServer, userJid });
        await relayMessage('status@broadcast', msg.message, {
            messageId: msg.key.id,
            statusJidList: Array.from(statusJidList),
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {},
                    content: [
                        {
                            tag: 'mentioned_users',
                            attrs: {},
                            content: jids.map(jid => ({ tag: 'to', attrs: { jid } }))
                        }
                    ]
                }
            ]
        });
        for (const gJid of jids) {
            const notif = generateWAMessageFromContent(gJid, {
                messageContextInfo: { messageSecret: crypto.randomBytes(32) },
                groupStatusMentionMessage: proto.Message.GroupStatusMentionMessage.create({
                    message: {
                        protocolMessage: { key: msg.key, type: 25 }
                    }
                })
            }, {});
            await relayMessage(gJid, notif.message, { messageId: notif.key.id });
        }
        return msg;
    };

    return { mentionAll, scheduleMessage, sendStatusMention };
};
