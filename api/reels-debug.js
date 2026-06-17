/**
 * /api/reels-debug?pin=1234&username=pony.makeup
 * user_medias?username_or_id_or_url={username} 직접 호출 테스트
 */
const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { pin, username = 'pony.makeup' } = req.query;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN 필요' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY 없음' });

  const HEADERS = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  };

  const url = `${BASE}/user_medias?username_or_id_or_url=${encodeURIComponent(username)}&count=6`;

  let result;
  try {
    const r = await fetch(url, { headers: HEADERS });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }

    const raw = body?.data?.items ?? body?.items ?? [];
    const videos = raw.filter(i => i.media_type === 2 || i.product_type === 'clips' || i.is_video === true);

    result = {
      url,
      status: r.status,
      ok: r.ok,
      totalItems: raw.length,
      videoItems: videos.length,
      topLevelKeys: typeof body === 'object' && body ? Object.keys(body) : [],
      dataKeys: typeof body?.data === 'object' && body?.data ? Object.keys(body.data) : [],
      sampleItem: raw[0] ? {
        media_type: raw[0].media_type,
        product_type: raw[0].product_type,
        is_video: raw[0].is_video,
        play_count: raw[0].play_count,
        taken_at: raw[0].taken_at,
        username: raw[0].user?.username,
      } : null,
    };
  } catch (e) {
    result = { url, status: 'ERROR', ok: false, error: e.message };
  }

  return res.json({ username, result });
};
