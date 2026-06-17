/**
 * /api/reels-debug?pin=1234
 *   &username=nike          → userinfo 테스트 (user_id 추출)
 *   &user_id=12345678       → user_reels 직접 테스트 (userinfo 생략)
 */
const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { pin, username, user_id: directUid } = req.query;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN 필요' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY 없음' });

  const HEADERS = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
    'Content-Type': 'application/json',
  };

  let userinfoResult = null;
  let user_id = directUid ?? null;

  // Step 1: username → user_id (직접 user_id 제공 시 생략)
  if (!user_id && username) {
    const url = `${BASE}/user/${encodeURIComponent(username)}`;
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
      userinfoResult = { url, status: r.status, ok: r.ok, body };

      if (r.ok && typeof body === 'object') {
        user_id =
          body?.data?.id       ?? body?.data?.pk       ??
          body?.id             ?? body?.pk             ??
          body?.user?.id       ?? body?.user?.pk       ??
          body?.data?.user?.id ?? body?.data?.user?.pk ?? null;
        if (user_id) user_id = String(user_id);
      }
    } catch (e) {
      userinfoResult = { url, status: 'ERROR', ok: false, body: e.message };
    }
  }

  // Step 2: user_reels 호출
  let reelsResult = null;
  if (user_id) {
    const url = `${BASE}/user_reels?user_id=${encodeURIComponent(user_id)}`;
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }

      const rawItems = body?.data?.items ?? body?.items ?? body?.reels_media ?? body?.data?.reels_media ?? [];
      const videoItems = Array.isArray(rawItems)
        ? rawItems.filter(i => i.media_type === 2 || i.is_video === true || i.video_url)
        : [];

      reelsResult = {
        url,
        status: r.status,
        ok: r.ok,
        topLevelKeys: typeof body === 'object' && body ? Object.keys(body) : [],
        dataKeys: typeof body?.data === 'object' && body?.data ? Object.keys(body.data) : [],
        totalItems: Array.isArray(rawItems) ? rawItems.length : `not array: ${typeof rawItems}`,
        videoItems: videoItems.length,
        sampleItem: Array.isArray(rawItems) && rawItems[0] ? {
          keys: Object.keys(rawItems[0]),
          media_type: rawItems[0].media_type,
          is_video: rawItems[0].is_video,
          has_video_url: !!rawItems[0].video_url,
          taken_at: rawItems[0].taken_at,
        } : null,
        rawBodyPreview: typeof body === 'string' ? body : JSON.stringify(body).slice(0, 800),
      };
    } catch (e) {
      reelsResult = { url, status: 'ERROR', ok: false, body: e.message };
    }
  }

  return res.json({
    username: username ?? '(skipped)',
    step1_userinfo: userinfoResult,
    extracted_user_id: user_id,
    step2_reels: reelsResult,
  });
};
