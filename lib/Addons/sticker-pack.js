import { generateWAMessageContent, generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import crypto from 'crypto';

export const makeStickerPack = ({ waUploadToServer, relayMessage }) => {

    // Kirim 1 Paket Stiker Utuh (3 - 30 Stiker WebP)
    const sendStickerPack = async (jid, content = {}, options = {}) => {
        const {
            name = "SILA MD Pack",
            publisher = "Sila Tech",
            description = "Sticker Pack by @silatech/baileys",
            stickers = [], // Array berisi buffer/url file .webp (minimal 3, maksimal 30)
            cover // Opsional: buffer/url gambar cover pack
        } = content;

        if (!Array.isArray(stickers) || stickers.length < 3) {
            throw new Error("Minimal masukin 3 stiker (.webp) buat bikin Sticker Pack mass!");
        }

        const listStickers = stickers.slice(0, 30);
        const uploadedStickers = [];

        // 1. Upload semua stiker WebP ke server WA
        for (let i = 0; i < listStickers.length; i++) {
            const st = listStickers[i];
            const mediaInput = st.sticker ? st : { sticker: st.url || st };
            const uploaded = await generateWAMessageContent(mediaInput, { upload: waUploadToServer });
            const sMsg = uploaded.stickerMessage;

            uploadedStickers.push({
                fileName: `${i + 1}.webp`,
                isAnimated: !!st.isAnimated || !!sMsg.isAnimated,
                emojis: st.emojis || ["🔥"],
                accessibilityLabel: st.label || `Sticker ${i + 1}`,
                isLottie: false,
                mimetype: sMsg.mimetype || "image/webp"
            });
        }

        // 2. Upload Cover Thumbnail (pakai stiker pertama kalo cover kosong)
        const coverSource = cover ? { image: cover } : { image: listStickers[0].sticker || listStickers[0].url || listStickers[0] };
        const uploadedCover = await generateWAMessageContent(coverSource, { upload: waUploadToServer });
        const imgMsg = uploadedCover.imageMessage;

        const packId = crypto.randomBytes(8).toString('hex');

        // 3. Susun StickerPackMessage sesuai proto WA v7
        const packPayload = proto.Message.StickerPackMessage
            ? {
                stickerPackMessage: proto.Message.StickerPackMessage.create({
                    stickerPackId: packId,
                    name,
                    publisher,
                    description,
                    stickers: uploadedStickers,
                    fileLength: imgMsg.fileLength,
                    fileSha256: imgMsg.fileSha256,
                    fileEncSha256: imgMsg.fileEncSha256,
                    mediaKey: imgMsg.mediaKey,
                    directPath: imgMsg.directPath,
                    caption: description,
                    trayIconFileName: "cover.png",
                    imageDataHash: crypto.createHash('sha256').update(packId).toString('base64')
                })
            }
            : {
                extendedTextMessage: {
                    text: `📦 *${name}* by ${publisher}\n(${listStickers.length} stickers)`
                }
            };

        const msg = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32)
            },
            ...packPayload
        }, options);

        await relayMessage(jid, msg.message, { messageId: msg.key.id });
        return msg;
    };

    return { sendStickerPack };
};
