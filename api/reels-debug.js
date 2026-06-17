/**
 * /api/reels-debug?pin=1234&username=pony.makeup
 * 1) userinfo 호출로 user_id 추출
 * 2) user_reels 호출로 영상 목록 확인
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
    'Content-Type': 'application/json',
  };

  // Step 1: userinfo로 user_id 추출
  const userinfoUrl = `${BASE}/user/${encodeURIComponent(username)}`;
  let userinfoResult, user_id;
  try {
    const r = await fetch(userinfoUrl, { headers: HEADERS });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    userinfoResult = { url: userinfoUrl, status: r.status, ok: r.ok, body };

    if (r.ok && typeof body === 'object') {
      user_id =
        body?.data?.id ?? body?.data?.pk ??
        body?.id ?? body?.pk ??
        body?.user?.id ?? body?.user?.pk ??
        body?.data?.user?.id ?? body?.data?.user?.pk ?? null;
      if (user_id) user_id = String(user_id);
    }
  } catch (e) {
    userinfoResult = { url: userinfoUrl, status: 'ERROR', ok: false, body: e.message };
  }

  // Step 2: user_reels 호출 (user_id 있을 때)
  let reelsResult = null;
  if (user_id) {
    const reelsUrl = `${BASE}/user_reels?user_id=${encodeURIComponent(user_id)}`;
    try {
      const r = await fetch(reelsUrl, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }

      // 아이템 수 및 샘플 추출
      const rawItems = body?.data?.items ?? body?.items ?? [];
      const videoItems = rawItems.filter(i =>
        i.media_type === 2 || i.is_video === true || i.video_url
      );

      reelsResult = {
        url: reelsUrl,
        status: r.status,
        ok: r.ok,
        totalItems: rawItems.length,
        videoItems: videoItems.length,
        sampleItem: rawItems[0] ? {
          id: rawItems[0].id ?? rawItems[0].pk,
          media_type: rawItems[0].media_type,
          is_video: rawItems[0].is_video,
          has_video_url: !!rawItems[0].video_url,
          taken_at: rawItems[0].taken_at,
          view_count: rawItems[0].video_view_count ?? rawItems[0].play_count ?? rawItems[0].view_count,
        } : null,
        topLevelKeys: typeof body === 'object' ? Object.keys(body ?? {}) : [],
      };
    } catch (e) {
      reelsResult = { url: `${BASE}/user_reels?user_id=${user_id}`, status: 'ERROR', ok: false, body: e.message };
    }
  }

  return res.json({
    username,
    step1_userinfo: userinfoResult,
    extracted_user_id: user_id,
    step2_reels: reelsResult,
  });
};
