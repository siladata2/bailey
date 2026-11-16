import { generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import crypto from 'crypto';

export const makePollEvent = ({ sendMessage, relayMessage }) => {

    // 1. Kirim Polling / Voting
    const sendPoll = async (jid, content = {}, options = {}) => {
        const {
            name = "Pilih salah satu:",
            values = [], // Array opsi: ["Opsi A", "Opsi B"]
            selectableCount = 1 // 1 = pilih satu, 0 = boleh pilih banyak
        } = content;

        return sendMessage(jid, {
            poll: {
                name,
                values,
                selectableCount
            }
        }, options);
    };

    // 2. Kirim Undangan Acara / Event Grup
    const sendEvent = async (jid, content = {}, options = {}) => {
        const {
            name = "Acara Baru",
            description = "",
            locationName = "Online",
            startTime = Math.floor(Date.now() / 1000) + 3600, // Default 1 jam dari sekarang
            endTime = Math.floor(Date.now() / 1000) + 7200,
            joinLink = ""
        } = content;

        const msg = generateWAMessageFromContent(jid, {
            messageContextInfo: { messageSecret: crypto.randomBytes(32) },
            eventMessage: proto.Message.EventMessage.create({
                isCanceled: false,
                name,
                description,
                location: { name: locationName },
                startTime,
                endTime,
                joinLink
            })
        }, options);

        await relayMessage(jid, msg.message, { messageId: msg.key.id });
        return msg;
    };

    // 3. Kirim Kartu Kontak Lengkap (vCard)
    const sendContactCard = async (jid, contacts = [], options = {}) => {
        const list = Array.isArray(contacts) ? contacts : [contacts];
        const vcards = list.map(c => {
            const num = String(c.number || c.phone || "").replace(/\D/g, "");
            const name = c.name || "Kontak";
            const org = c.org || "Sila Tech";
            return {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${org};\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`
            };
        });

        return sendMessage(jid, {
            contacts: {
                displayName: list.length > 1 ? `${list.length} Kontak` : (list?.name || "Kontak"),
                contacts: vcards
            }
        }, options);
    };

    return { sendPoll, sendEvent, sendContactCard };
};
