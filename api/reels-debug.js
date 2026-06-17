/**
 * /api/reels-debug?pin=1234&username=paik_jk
 * 여러 URL 패턴 동시 테스트 (어떤 게 작동하는지 확인)
 */
const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { pin, username = 'paik_jk' } = req.query;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN 필요' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY 없음' });

  const HEADERS = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  };

  const patterns = [
    // userinfo 패턴들
    `${BASE}/user/${encodeURIComponent(username)}`,
    `${BASE}/userinfo?username=${encodeURIComponent(username)}`,
    `${BASE}/userinfo?username_or_id_or_url=${encodeURIComponent(username)}`,
    // user_medias 패턴들
    `${BASE}/user_medias?username=${encodeURIComponent(username)}&count=3`,
    `${BASE}/user_medias?username_or_id_or_url=${encodeURIComponent(username)}&count=3`,
    `${BASE}/user_medias/${encodeURIComponent(username)}?count=3`,
    // user_medias with Instagram URL
    `${BASE}/user_medias?username_or_id_or_url=${encodeURIComponent(`https://www.instagram.com/${username}/`)}&count=3`,
  ];

  const results = [];
  for (const url of patterns) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }

      const topKeys = typeof body === 'object' && body ? Object.keys(body) : [];
      const dataKeys = typeof body?.data === 'object' && body?.data ? Object.keys(body.data) : [];
      const itemsCount = (body?.data?.items ?? body?.items ?? []).length;
      const hasUser = !!(body?.data?.user ?? body?.user);

      results.push({
        url: url.replace(BASE, ''),
        status: r.status,
        ok: r.ok,
        topKeys,
        dataKeys,
        itemsCount,
        hasUser,
        preview: typeof body === 'object' ? JSON.stringify(body).slice(0, 150) : String(body).slice(0, 150),
      });
    } catch (e) {
      results.push({ url: url.replace(BASE, ''), status: 'ERROR', ok: false, error: e.message });
    }
  }

  const working = results.filter(r => r.ok);
  return res.json({ username, working: working.length, results });
};
