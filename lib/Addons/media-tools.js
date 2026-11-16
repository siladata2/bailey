import { downloadContentFromMessage } from '../Utils/messages-media.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Helper Convert Gambar/Video ke WebP lewat FFmpeg sistem
const convertToWebp = (inputBuffer, isVideo = false) => new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(tmpDir, `${id}_in`);
    const outFile = path.join(tmpDir, `${id}_out.webp`);

    fs.writeFileSync(inFile, inputBuffer);

    const args = isVideo
        ? ['-i', inFile, '-vcodec', 'libwebp', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0', '-loop', '0', '-ss', '00:00:00', '-t', '00:00:08', '-preset', 'default', '-an', '-vsync', '0', outFile]
        : ['-i', inFile, '-vcodec', 'libwebp', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white@0.0', outFile];

    const ff = spawn('ffmpeg', args);
    ff.on('close', (code) => {
        try { fs.unlinkSync(inFile); } catch {}
        if (code !== 0 || !fs.existsSync(outFile)) return reject(new Error('Gagal convert WebP (pastikan ffmpeg terinstall di Termux/VPS)'));
        const webpBuf = fs.readFileSync(outFile);
        try { fs.unlinkSync(outFile); } catch {}
        resolve(webpBuf);
    });
    ff.on('error', reject);
});

export const makeMediaTools = ({ sendMessage }) => {

    // 1. Kirim Foto Jadi Stiker Otomatis
    const sendImageAsSticker = async (jid, imageBuffer, options = {}) => {
        const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(await (await fetch(imageBuffer.url || imageBuffer)).arrayBuffer());
        const webp = await convertToWebp(buf, false);
        return sendMessage(jid, { sticker: webp }, options);
    };

    // 2. Kirim Video/GIF Jadi Stiker Bergerak Otomatis
    const sendVideoAsSticker = async (jid, videoBuffer, options = {}) => {
        const buf = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(await (await fetch(videoBuffer.url || videoBuffer)).arrayBuffer());
        const webp = await convertToWebp(buf, true);
        return sendMessage(jid, { sticker: webp }, options);
    };

    // 3. Download Media dari Pesan (Gambar/Video/Audio/Sticker/Dokumen) Jadi Buffer
    const downloadMedia = async (msg) => {
        const m = msg.message || msg;
        const type = Object.keys(m).find(k => k.endsWith('Message') && k !== 'protocolMessage' && k !== 'senderKeyDistributionMessage');
        if (!type) throw new Error('Pesan ini tidak mengandung media wok!');
        const mediaType = type.replace('Message', '');
        const stream = await downloadContentFromMessage(m[type], mediaType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    };

    return { sendImageAsSticker, sendVideoAsSticker, downloadMedia };
};
