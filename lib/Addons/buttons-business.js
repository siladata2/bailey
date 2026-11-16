import { generateWAMessageContent, generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import { DEFAULT_FOOTER } from '../Defaults/index.js';

const parsePromoTime = (timeStr) => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return Math.floor(Date.now() / 1000) + timeStr;
    const match = String(timeStr).trim().match(/^(\d+)\s*([hmd])?$/i);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').toLowerCase();
    let seconds = val;
    if (unit === 'h') seconds = val * 86400; // h = hari
    else if (unit === 'm') seconds = val * 60; // m = menit
    else if (unit === 'd') seconds = val; // d = detik
    return Math.floor(Date.now() / 1000) + seconds;
};

// Node XML wajib biar Interactive / NativeFlow tembus ke HP penerima
const getBizNodes = (hasCatalogOrProduct = false) => [
    {
        tag: 'biz',
        attrs: {},
        content: [
            {
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [
                    {
                        tag: 'native_flow',
                        attrs: { name: hasCatalogOrProduct ? 'catalog_message' : 'mixed', v: '9' }
                    }
                ]
            }
        ]
    }
];

export const makeBusinessButtons = ({ waUploadToServer, relayMessage }) => {
    
    // 1. Kirim Tombol Interaktif Super Lengkap
    const sendButton = async (jid, content = {}, options = {}) => {
        const {
            text = "", caption = "", title = "", footer = DEFAULT_FOOTER,
            buttons = [], sections = [], buttonText = "Pilih Menu",
            promo, product, image, video, document
        } = content;

        const bodyText = text || caption || "";
        let header = { title, hasMediaAttachment: false };
        let isBizCatalog = !!product;

        if (image) {
            const media = await generateWAMessageContent({ image }, { upload: waUploadToServer });
            header = { ...header, hasMediaAttachment: true, imageMessage: media.imageMessage };
        } else if (video) {
            const media = await generateWAMessageContent({ video }, { upload: waUploadToServer });
            header = { ...header, hasMediaAttachment: true, videoMessage: media.videoMessage };
        } else if (document) {
            const media = await generateWAMessageContent({ document, mimetype: content.mimetype || 'application/pdf', fileName: content.fileName || 'Document.pdf' }, { upload: waUploadToServer });
            header = { ...header, hasMediaAttachment: true, documentMessage: media.documentMessage };
        } else if (product) {
            let prodImg = undefined;
            if (product.image) {
                const media = await generateWAMessageContent({ image: product.image }, { upload: waUploadToServer });
                prodImg = media.imageMessage;
            }
            header = {
                ...header,
                hasMediaAttachment: !!prodImg,
                productMessage: {
                    product: {
                        productImage: prodImg,
                        productId: product.productId || "12345",
                        title: product.title || title || "Produk",
                        description: product.description || "",
                        currencyCode: product.currencyCode || "IDR",
                        priceAmount1000: product.priceAmount1000 || 10000000,
                        productImageCount: 1
                    },
                    businessOwnerJid: product.businessOwnerJid || jid
                }
            };
        }

        const formattedButtons = buttons.map((btn, i) => {
            if (btn.name && btn.buttonParamsJson) return btn;

            // Tombol Katalog Toko
            if (btn.catalog || btn.businessOwnerJid) {
                isBizCatalog = true;
                return {
                    name: "cta_catalog",
                    buttonParamsJson: JSON.stringify({
                        business_phone_number: (btn.businessOwnerJid || btn.catalog || "").replace(/\D/g, "")
                    })
                };
            }

            // Tombol Produk Satuan (Single Product)
            if (btn.productId) {
                isBizCatalog = true;
                return {
                    name: "single_product",
                    buttonParamsJson: JSON.stringify({
                        product_id: String(btn.productId),
                        business_owner_jid: btn.ownerJid || jid
                    })
                };
            }

            // Tombol Kirim Lokasi
            if (btn.location || btn.type === "location") {
                return { name: "send_location", buttonParamsJson: JSON.stringify({}) };
            }

            // Tombol URL
            if (btn.url) {
                return {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.text || btn.displayText || "Buka Link",
                        url: btn.url,
                        merchant_url: btn.url
                    })
                };
            }

            // Tombol Copy Kode
            if (btn.copy) {
                return {
                    name: "cta_copy",
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.text || btn.displayText || "Salin Kode",
                        id: btn.id || "copy_" + i,
                        copy_code: btn.copy
                    })
                };
            }

            // Default: Quick Reply
            return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text || btn.displayText || "Button " + (i + 1),
                    id: btn.id || "btn_" + (i + 1)
                })
            };
        });

        if (sections.length > 0) {
            formattedButtons.unshift({
                name: "single_select",
                buttonParamsJson: JSON.stringify({ title: buttonText, sections })
            });
        }

        const nativeFlowPayload = { buttons: formattedButtons };
        if (promo) {
            const expiration = parsePromoTime(promo.time);
            nativeFlowPayload.messageParamsJson = JSON.stringify({
                limited_time_offer: {
                    text: promo.text || "Penawaran Terbatas!",
                    url: promo.url || "https://github.com",
                    copy_code: promo.code || promo.copy || "",
                    expiration_time: expiration
                }
            });
            if (promo.code && !formattedButtons.some(b => b.name === "cta_copy")) {
                formattedButtons.unshift({
                    name: "cta_copy",
                    buttonParamsJson: JSON.stringify({
                        display_text: promo.buttonText || `Salin Kode (${promo.code})`,
                        id: "promo_copy",
                        copy_code: promo.code
                    })
                });
            }
        }

        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                        header: proto.Message.InteractiveMessage.Header.create(header),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create(nativeFlowPayload)
                    })
                }
            }
        }, options);

        await relayMessage(jid, msg.message, {
            messageId: msg.key.id,
            additionalNodes: getBizNodes(isBizCatalog)
        });
        return msg;
    };

    // 2. Kirim Carousel (Kartu Geser Bisnis)
    const sendCarousel = async (jid, content = {}, options = {}) => {
        const { text = "", footer = DEFAULT_FOOTER, cards = [] } = content;
        const carouselCards = [];

        for (const card of cards) {
            let header = { title: card.title || "", hasMediaAttachment: false };
            if (card.image) {
                const media = await generateWAMessageContent({ image: card.image }, { upload: waUploadToServer });
                header = { ...header, hasMediaAttachment: true, imageMessage: media.imageMessage };
            }
            const cardButtons = (card.buttons || []).map((btn, i) => ({
                name: btn.url ? "cta_url" : btn.copy ? "cta_copy" : btn.catalog ? "cta_catalog" : "quick_reply",
                buttonParamsJson: JSON.stringify(
                    btn.url
                        ? { display_text: btn.text || "Buka", url: btn.url, merchant_url: btn.url }
                        : btn.copy
                        ? { display_text: btn.text || "Salin", id: `copy_${i}`, copy_code: btn.copy }
                        : btn.catalog
                        ? { business_phone_number: String(btn.catalog).replace(/\D/g, "") }
                        : { display_text: btn.text || "Pilih", id: btn.id || `card_${i}` }
                )
            }));

            carouselCards.push({
                body: proto.Message.InteractiveMessage.Body.create({ text: card.body || "" }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: card.footer || DEFAULT_FOOTER }),
                header: proto.Message.InteractiveMessage.Header.create(header),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: cardButtons })
            });
        }

const msg = generateWAMessageFromContent(jid, {
viewOnceMessage: {
message: {
messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
interactiveMessage: proto.Message.InteractiveMessage.create({
body: proto.Message.InteractiveMessage.Body.create({ text }),
footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({ cards: carouselCards })
})
}
}
}, options);
await relayMessage(jid, msg.message, {
messageId: msg.key.id,
additionalNodes: getBizNodes(false)
});
return msg;
};
// 3. Helper Cepat Kirim Katalog Toko (sock.sendCatalog)
const sendCatalog = async (jid, content = {}, options = {}) => {
return sendButton(jid, {
title: content.title || "Katalog Resmi",
text: content.text || "Silakan cek daftar produk kami di katalog 👇",
footer: content.footer || DEFAULT_FOOTER,
image: content.image,
buttons: [{ catalog: content.businessOwnerJid || content.phone }]
}, options);
};
return { sendButton, sendCarousel, sendCatalog };
};
