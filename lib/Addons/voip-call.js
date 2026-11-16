import crypto from 'crypto';
import { spawn } from 'child_process';
import { RTCPeerConnection, MediaStreamTrack, RtpPacket, RtpHeader } from 'werift';

export const makeVoipCall = ({ sendNode, ev, userJid }) => {
    const activeCalls = new Map();

    // Pantau status panggilan (diangkat / ditolak target)
    if (ev) {
        ev.on('call', async (calls) => {
            for (const c of calls) {
                const session = activeCalls.get(c.id);
                if (!session) continue;

                // Kalo target ngangkat telepon (accept), mulai kirim paket RTP Opus
                if (c.status === 'accept' && session.ffmpegProc) {
                    let seq = Math.floor(Math.random() * 65535);
                    let timestamp = Math.floor(Math.random() * 0xffffffff);
                    const ssrc = crypto.randomBytes(4).readUInt32BE(0);

                    session.ffmpegProc.stdout.on('data', (opusFrame) => {
                        if (session.track && !session.closed) {
                            const header = new RtpHeader({
                                payloadType: 111, // Opus
                                sequenceNumber: seq++ & 0xffff,
                                timestamp: timestamp >>> 0,
                                ssrc
                            });
                            timestamp += 320; // 20ms frame @ 16kHz
                            const packet = new RtpPacket(header, opusFrame);
                            session.track.writeRtp(packet);
                        }
                    });
                }

                // Kalo ditolak / dimatiin, bersihin WebRTC & FFmpeg
                if (c.status === 'reject' || c.status === 'terminate') {
                    session.closed = true;
                    if (session.ffmpegProc) session.ffmpegProc.kill('SIGKILL');
                    if (session.pc) await session.pc.close().catch(() => {});
                    activeCalls.delete(c.id);
                }
            }
        });
    }

    // 1. Mulai Panggilan Suara / Video + WebRTC Audio Stream
    const initiateCall = async (jid, options = {}) => {
        const { isVideo = false, audioUrl = null } = options;
        const callId = crypto.randomBytes(16).toString('hex').toUpperCase();

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ["stun", "stun.l.google.com", "19302"].join(":") }]
        });
        const track = new MediaStreamTrack({ kind: 'audio' });
        pc.addTrack(track);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendNode({
            tag: 'call',
            attrs: { to: jid, id: callId, from: userJid },
            content: [
                {
                    tag: 'offer',
                    attrs: { 'call-id': callId, 'call-creator': userJid },
                    content: [
                        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                        ...(isVideo ? [{ tag: 'video', attrs: { enc: 'vp8', orientation: '0' } }] : []),
                        { tag: 'net', attrs: { medium: '3' } },
                        { tag: 'capability', attrs: { ver: '1' }, content: new Uint8Array([1]) }
                    ]
                }
            ]
        });

        let ffmpegProc = null;
        if (audioUrl) {
            ffmpegProc = spawn('ffmpeg', [
                '-re', '-i', audioUrl,
                '-acodec', 'libopus', '-ar', '16000', '-ac', '1',
                '-frame_duration', '20', '-f', 'data', 'pipe:1'
            ]);
            ffmpegProc.on('error', () => {});
        }

        const session = {
            callId,
            to: jid,
            pc,
            track,
            ffmpegProc,
            closed: false,
            end: () => endCall(jid, callId)
        };

        activeCalls.set(callId, session);
        return session;
    };

    // 2. Tutup Panggilan & Matikan WebRTC + FFmpeg
    const endCall = async (jid, callId) => {
        const session = activeCalls.get(callId);
        if (session) {
            session.closed = true;
            if (session.ffmpegProc) session.ffmpegProc.kill('SIGKILL');
            if (session.pc) await session.pc.close().catch(() => {});
            activeCalls.delete(callId);
        }

        await sendNode({
            tag: 'call',
            attrs: { to: jid, id: crypto.randomBytes(8).toString('hex').toUpperCase() },
            content: [
                {
                    tag: 'terminate',
                    attrs: { 'call-id': callId, 'call-creator': userJid }
                }
            ]
        });
        return true;
    };

    return { initiateCall, endCall };
};
