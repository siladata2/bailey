import { generateWAMessageFromContent } from '../Utils/messages.js';
import { proto } from '../../WAProto/index.js';
import crypto from 'crypto';

// Helper Parser Markdown AI Otomatis (Deteksi Code Block ``` dan Tabel | | secara instan)
const parseMarkdownToSubmessages = (markdownText = "") => {
    const submessages = [];
    const lines = markdownText.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // 1. Deteksi Code Block (```bahasa ... ```)
        if (line.trim().startsWith('```')) {
            const lang = line.trim().slice(3).trim() || 'javascript';
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            submessages.push({
                messageType: 2, // CODE
                codeMetadata: {
                    codeLanguage: lang,
                    codeBlocks: [{ highlightType: 0, codeContent: codeLines.join('\n') }]
                }
            });
            i++;
            continue;
        }

        // 2. Deteksi Tabel Markdown (| Kolom 1 | Kolom 2 |)
        if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().includes('---')) {
            const parseRow = (rowStr) => rowStr.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            const headers = parseRow(line);
            i += 2; // Lewati baris header & garis pemisah ---
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push({ items: parseRow(lines[i]) });
                i++;
            }
            submessages.push({
                messageType: 3, // TABLE
                tableMetadata: {
                    title: "",
                    rows: [{ items: headers, isHeading: true }, ...rows]
                }
            });
            continue;
        }

        // 3. Teks Paragraf Biasa
        if (line.trim() !== '') {
            submessages.push({
                messageType: 1, // TEXT
                messageText: line
            });
        }
        i++;
    }

    return submessages;
};

export const makeAiRich = ({ relayMessage }) => {

    // Kirim Rich AI Message (Tabel, Code Block, LaTeX, atau Auto-Parse Markdown AI)
    const sendRichMessage = async (jid, content = {}, options = {}) => {
        const {
            text = "",
            blocks = [], // Array manual: [{ type: 'table', title: '...', headers: [...], rows: [[...]] }, { type: 'code', language: 'js', code: '...' }, { type: 'latex', expression: '...' }]
            autoParse = true, // Otomatis ubah markdown ```code``` & |tabel| dari jawaban AI jadi Rich UI
            aiIcon = true
        } = typeof content === 'string' ? { text: content } : content;

        let submessages = [];

        // Jika user kirim array blocks terstruktur
        if (Array.isArray(blocks) && blocks.length > 0) {
            for (const b of blocks) {
                if (b.type === 'code') {
                    submessages.push({
                        messageType: 2,
                        codeMetadata: {
                            codeLanguage: b.language || b.lang || 'javascript',
                            codeBlocks: [{ highlightType: 0, codeContent: b.code || b.content || '' }]
                        }
                    });
                } else if (b.type === 'table') {
                    const tableRows = [];
                    if (b.headers) tableRows.push({ items: b.headers, isHeading: true });
                    for (const r of (b.rows || [])) {
                        tableRows.push({ items: Array.isArray(r) ? r : r.items, isHeading: !!r.isHeading });
                    }
                    submessages.push({
                        messageType: 3,
                        tableMetadata: { title: b.title || "", rows: tableRows }
                    });
                } else if (b.type === 'latex') {
                    submessages.push({
                        messageType: 4,
                        latexMetadata: {
                            text: b.text || b.expression || "",
                            expressions: [{ latexExpression: b.expression || b.text || "" }]
                        }
                    });
                } else {
                    submessages.push({
                        messageType: 1,
                        messageText: b.text || b.content || ""
                    });
                }
            }
        } else if (autoParse && text) {
            submessages = parseMarkdownToSubmessages(text);
        } else if (text) {
            submessages.push({ messageType: 1, messageText: text });
        }

        // Susun BotInvoke / RichResponseMessage sesuai proto WA v7
        const richPayload = proto.Message.RichResponseMessage
            ? {
                richResponseMessage: proto.Message.RichResponseMessage.create({
                    messageType: 1, // AI_RICH_RESPONSE
                    submessages
                })
            }
            : {
                extendedTextMessage: {
                    text: text || blocks.map(b => b.code || b.text || '').join('\n\n')
                }
            };

        const msg = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32),
                ...(aiIcon ? { botMetadata: { personaId: "silabaileys_ai" } } : {})
            },
            ...richPayload
        }, options);

        await relayMessage(jid, msg.message, {
            messageId: msg.key.id,
            additionalNodes: [
                {
                    tag: 'bot',
                    attrs: { biz_bot: '1' }
                }
            ]
        });

        return msg;
    };

    return { sendRichMessage };
};
