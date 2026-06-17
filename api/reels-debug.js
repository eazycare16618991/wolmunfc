/**
 * /api/reels-debug?pin=1234&username=paik_jk
 * userinfo URL 패턴 전체 테스트 → 어떤 게 작동하는지 확인용
 */
const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { pin, username = 'paik_jk' } = req.query;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN 필요' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY 없음' });

  const HEADERS = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
    'Content-Type': 'application/json',
  };

  const BASE = `https://${RAPIDAPI_HOST}`;
  const patterns = [
    `${BASE}/api/v1/instagram/userinfo?username_or_id_or_url=${username}`,
    `${BASE}/api/v1/instagram/userinfo?username=${username}`,
    `${BASE}/api/v1/instagram/user_info?username=${username}`,
    `${BASE}/api/v1/instagram/userinfo?user=${username}`,
    `${BASE}/api/v1/instagram/userinfo/${username}`,
    `${BASE}/api/v1/userinfo?username=${username}`,
    `${BASE}/api/v1/instagram/user_medias?username_or_id_or_url=${username}&count=1`,
    `${BASE}/api/v1/instagram/user_medias?username=${username}&count=1`,
    `${BASE}/api/v1/instagram/users?username=${username}`,
    `${BASE}/api/v1/instagram/account?username=${username}`,
    `${BASE}/api/v1/instagram/profile?username=${username}`,
    `${BASE}/api/v1/instagram/get_user?username=${username}`,
  ];

  const results = [];
  for (const url of patterns) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
      results.push({ url, status: r.status, ok: r.ok, body });
    } catch (e) {
      results.push({ url, status: 'ERROR', ok: false, body: e.message });
    }
  }

  const working = results.filter(r => r.ok);
  return res.json({ working: working.length, results });
};
