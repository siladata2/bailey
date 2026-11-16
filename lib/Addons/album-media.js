import { generateWAMessage, generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import crypto from 'crypto';

export const makeAlbumMedia = ({ waUploadToServer, relayMessage, userJid }) => {

    // Kirim Banyak Foto/Video Sekaligus Jadi 1 Kotak Album
    const sendAlbum = async (jid, medias = [], options = {}) => {
        if (!Array.isArray(medias) || medias.length < 2) {
            throw new Error("Minimal masukin 2 media (foto/video) buat bikin album mass!");
        }
        if (medias.length > 10) {
            medias = medias.slice(0, 10); // Batas maksimal WhatsApp 10 media per album
        }

        const caption = options.caption || options.text || "";
        const expectedImageCount = medias.filter(m => m.image || m.type === 'image').length;
        const expectedVideoCount = medias.filter(m => m.video || m.type === 'video').length;

        // 1. Bikin Pesan Induk Album (albumMessage)
        const albumMsg = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32)
            },
            albumMessage: proto.Message.AlbumMessage.create({
                expectedImageCount,
                expectedVideoCount
            })
        }, options);

        await relayMessage(jid, albumMsg.message, { messageId: albumMsg.key.id });

        // 2. Upload & Kirim Tiap Media Terkait ke Induk Album
        const sentItems = [];
        for (let i = 0; i < medias.length; i++) {
            const item = medias[i];
            const isVideo = !!(item.video || item.type === 'video');
            const mediaContent = isVideo
                ? { video: item.video || item.url || item, caption: i === 0 ? (item.caption || caption) : (item.caption || "") }
                : { image: item.image || item.url || item, caption: i === 0 ? (item.caption || caption) : (item.caption || "") };

            const msg = await generateWAMessage(jid, mediaContent, {
                upload: waUploadToServer,
                userJid: userJid || options.userJid,
                quoted: options.quoted
            });

            // Tempelkan asosiasi ke induk album
            msg.message.messageContextInfo = {
                messageSecret: crypto.randomBytes(32),
                messageAssociation: {
                    associationType: 1, // MEDIA_ALBUM
                    parentMessageKey: albumMsg.key
                }
            };

            await relayMessage(jid, msg.message, { messageId: msg.key.id });
            sentItems.push(msg);

            // Kasih jeda dikit (300ms) biar urutan foto/videonya gak ketuker di HP penerima
            if (i < medias.length - 1) {
                await new Promise(res => setTimeout(res, 300));
            }
        }

        return { album: albumMsg, items: sentItems };
    };

    return { sendAlbum };
};
