// Vercel Function: POST /api/telegram (multipart/form-data, campo "video")
const busboy = require('busboy');

// A Vercel limita o corpo da requisição a 4,5 MB.
const MAX_BYTES = 4.5 * 1024 * 1024;
const RATE = { windowMs: 10 * 60 * 1000, max: 5 };
const hits = new Map(); // limitação em memória (melhor esforço; veja README)

const allowedOrigins = () =>
  (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE.max;
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try { bb = busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1, fields: 6, fieldSize: 1024 } }); }
    catch { return reject({ status: 400, message: 'Requisição multipart inválida' }); }
    const out = { fields: {}, file: null };
    bb.on('field', (k, v) => { out.fields[k] = v; });
    bb.on('file', (name, stream, info) => {
      if (name !== 'video') return stream.resume();
      const chunks = [];
      stream.on('data', d => chunks.push(d));
      stream.on('limit', () => reject({ status: 413, message: 'Arquivo maior que 4,5 MB (limite da Vercel)' }));
      stream.on('end', () => { out.file = { buf: Buffer.concat(chunks), filename: info.filename }; });
    });
    bb.on('error', () => reject({ status: 400, message: 'Falha ao ler o formulário' }));
    bb.on('close', () => resolve(out));
    Buffer.isBuffer(req.body) ? bb.end(req.body) : req.pipe(bb);
  });
}

function sniff(buf) {
  if (buf.length > 12 && buf.slice(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  return null;
}

module.exports = async (req, res) => {
  const origin = (req.headers.origin || '').replace(/\/$/, '');
  const ok = origin && allowedOrigins().includes(origin);
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(ok ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });
  if (!ok) return res.status(403).json({ ok: false, error: 'Origem não autorizada' });

  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'Servidor sem credenciais configuradas' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'Muitas requisições. Tente mais tarde.' });
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES + 4096)
    return res.status(413).json({ ok: false, error: 'Arquivo maior que 4,5 MB (limite da Vercel)' });

  try {
    const { fields, file } = await parseForm(req);
    if (!file || !file.buf.length) return res.status(400).json({ ok: false, error: 'Campo "video" ausente' });
    const kind = sniff(file.buf);
    if (!kind) return res.status(415).json({ ok: false, error: 'O arquivo não é MP4 nem WebM válido' });

    const int = (v, max) => { const n = parseInt(v, 10); return n > 0 && n <= max ? String(n) : null; };
    const asVideo = kind === 'mp4'; // sendVideo só reproduz MP4; WebM vai como documento
    const fd = new FormData();
    fd.append('chat_id', chat);
    fd.append(asVideo ? 'video' : 'document',
      new Blob([file.buf], { type: asVideo ? 'video/mp4' : 'video/webm' }), asVideo ? 'slideshow.mp4' : 'slideshow.webm');
    const cap = (fields.caption || '').slice(0, 200);
    if (cap) fd.append('caption', cap);
    if (asVideo) {
      fd.append('supports_streaming', 'true');
      for (const [k, max] of [['width', 4096], ['height', 4096], ['duration', 600]]) {
        const v = int(fields[k], max); if (v) fd.append(k, v);
      }
    }
    const r = await fetch(`https://api.telegram.org/bot${token}/${asVideo ? 'sendVideo' : 'sendDocument'}`,
      { method: 'POST', body: fd, signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return res.status(502).json({ ok: false, error: 'Telegram recusou: ' + (j.description || r.status) });
    return res.status(200).json({ ok: true, message_id: j.result && j.result.message_id, sent_as: asVideo ? 'video' : 'document' });
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: 'Erro interno ao enviar' });
  }
};
