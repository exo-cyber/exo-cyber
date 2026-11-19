//===================
// cute: reveal view-once in the chat
//===================
case 'cute': {
    if (!m.quoted) return Shefzyreply('❌ Reply to a view-once message!');

    const q = m.quoted;
    const mtype = q.mtype;

    const isViewOnce =
        mtype === 'viewOnceMessageV2' ||
        mtype === 'viewOnceMessage' ||
        mtype === 'viewOnceMessageV2Extension' ||
        q.viewOnce === true ||
        q.message?.viewOnceMessageV2 ||
        q.message?.viewOnceMessage ||
        q.message?.viewOnceMessageV2Extension ||
        q._data?.viewOnce === true;

    const isMedia = ['imageMessage','videoMessage','audioMessage','documentMessage'].includes(mtype);

    if (!isViewOnce && !isMedia) {
        return Shefzyreply('❌ That is not a view-once message!\n\nSupported: image, video, audio, document view-once.');
    }

    try {
        const vvBuf = await q.download();
        if (!vvBuf || vvBuf.length === 0) return Shefzyreply('❌ Could not download view-once content!');

        const innerMsg =
            q.message?.viewOnceMessageV2?.message ||
            q.message?.viewOnceMessage?.message ||
            q.message?.viewOnceMessageV2Extension?.message ||
            q.message || {};

        const innerType = Object.keys(innerMsg)[0] || mtype;

        const isVideo = innerType === 'videoMessage' || mtype === 'videoMessage' ||
            q.video || q.mimetype?.includes('video');
        const isAudio = innerType === 'audioMessage' || mtype === 'audioMessage' ||
            q.audio || q.mimetype?.includes('audio');
        const isDoc = innerType === 'documentMessage' || mtype === 'documentMessage';

        const innerData = innerMsg[innerType] || {};

        if (isVideo) {
            await sock.sendMessage(from, {
                video: vvBuf,
                mimetype: innerData.mimetype || 'video/mp4',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        } else if (isAudio) {
            await sock.sendMessage(from, {
                audio: vvBuf,
                mimetype: innerData.mimetype || 'audio/mpeg',
                ptt: innerData.ptt || false
            }, { quoted: m });
        } else if (isDoc) {
            await sock.sendMessage(from, {
                document: vvBuf,
                mimetype: innerData.mimetype || 'application/octet-stream',
                fileName: innerData.fileName || 'view_once_file',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        } else {
            await sock.sendMessage(from, {
                image: vvBuf,
                mimetype: innerData.mimetype || 'image/jpeg',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        }
    } catch (e) {
        console.log('[cute] error:', e.message);
        await Shefzyreply('❌ Failed to reveal view-once: ' + e.message);
    }
    break;
}

//===================
// damn: silently send view-once to DM (all types)
//===================
case 'damn': {
    if (!m.quoted) return Shefzyreply('❌ Reply to a view-once message!');

    const q2 = m.quoted;
    const mtype2 = q2.mtype;

    const isViewOnce2 =
        mtype2 === 'viewOnceMessageV2' ||
        mtype2 === 'viewOnceMessage' ||
        mtype2 === 'viewOnceMessageV2Extension' ||
        q2.viewOnce === true ||
        q2.message?.viewOnceMessageV2 ||
        q2.message?.viewOnceMessage ||
        q2.message?.viewOnceMessageV2Extension ||
        q2._data?.viewOnce === true;

    const isMedia2 = ['imageMessage','videoMessage','audioMessage','documentMessage'].includes(mtype2);

    if (!isViewOnce2 && !isMedia2) {
        return Shefzyreply('❌ That is not a view-once message!');
    }

    try {
        const vv2Buf = await q2.download();
        if (!vv2Buf || vv2Buf.length === 0) return Shefzyreply('❌ Could not download view-once content!');

        const innerMsg2 =
            q2.message?.viewOnceMessageV2?.message ||
            q2.message?.viewOnceMessage?.message ||
            q2.message?.viewOnceMessageV2Extension?.message ||
            q2.message || {};

        const innerType2 = Object.keys(innerMsg2)[0] || mtype2;

        const isVideo2 = innerType2 === 'videoMessage' || mtype2 === 'videoMessage' ||
            q2.video || q2.mimetype?.includes('video');
        const isAudio2 = innerType2 === 'audioMessage' || mtype2 === 'audioMessage' ||
            q2.audio || q2.mimetype?.includes('audio');
        const isDoc2 = innerType2 === 'documentMessage' || mtype2 === 'documentMessage';

        const innerData2 = innerMsg2[innerType2] || {};
        const dmJid = sender;

        // Send to DM silently: NO reaction, NO reply in group
        if (isVideo2) {
            await sock.sendMessage(dmJid, {
                video: vv2Buf,
                mimetype: innerData2.mimetype || 'video/mp4',
                caption: '👁️ *View-once (saved from group)*'
            });
        } else if (isAudio2) {
            await sock.sendMessage(dmJid, {
                audio: vv2Buf,
                mimetype: innerData2.mimetype || 'audio/mpeg',
                ptt: innerData2.ptt || false
            });
        } else if (isDoc2) {
            await sock.sendMessage(dmJid, {
                document: vv2Buf,
                mimetype: innerData2.mimetype || 'application/octet-stream',
                fileName: innerData2.fileName || 'view_once_file',
                caption: '👁️ *View-once (saved from group)*'
            });
        } else {
            await sock.sendMessage(dmJid, {
                image: vv2Buf,
                mimetype: innerData2.mimetype || 'image/jpeg',
                caption: '👁️ *View-once (saved from group)*'
            });
        }
    } catch (e) {
        console.log('[damn] error:', e.message);
        // Even on error, stay silent in group
    }
    break;
}
