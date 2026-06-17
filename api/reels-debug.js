/**
 * /api/reels-debug?pin=1234&username=pony.makeup[&flush=1]
 *   flush=1 → KV에 저장된 uid 캐시 삭제 후 재조회
 *   user_id=숫자 → userinfo 생략하고 user_reels 직접 테스트
 */
const { kv } = require('@vercel/kv');
const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { pin, username, user_id: directUid, flush } = req.query;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN 필요' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY 없음' });

  const HEADERS = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
    'Content-Type': 'application/json',
  };

  let flushed = false;
  let cachedUid = null;
  let userinfoResult = null;
  let user_id = directUid ?? null;

  if (username) {
    // flush=1이면 기존 KV 캐시 삭제
    if (flush === '1') {
      try { await kv.del(`uid_${username}`); flushed = true; } catch (_) {}
    }

    // KV 캐시 확인
    try { cachedUid = await kv.get(`uid_${username}`); } catch (_) {}

    if (!user_id) {
      user_id = cachedUid ? String(cachedUid) : null;

      // 캐시 없으면 API 호출
      if (!user_id) {
        const url = `${BASE}/user/${encodeURIComponent(username)}`;
        try {
          const r = await fetch(url, { headers: HEADERS });
          const text = await r.text();
          let body;
          try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
          userinfoResult = { url, status: r.status, ok: r.ok, body };

          if (r.ok && typeof body === 'object') {
            const uid =
              body?.data?.id       ?? body?.data?.pk       ??
              body?.id             ?? body?.pk             ??
              body?.user?.id       ?? body?.user?.pk       ??
              body?.data?.user?.id ?? body?.data?.user?.pk ?? null;
            if (uid) {
              user_id = String(uid);
              await kv.set(`uid_${username}`, user_id).catch(() => {});
            }
          }
        } catch (e) {
          userinfoResult = { url: `${BASE}/user/${username}`, status: 'ERROR', ok: false, body: e.message };
        }
      }
    }
  }

  // user_reels 호출
  let reelsResult = null;
  if (user_id) {
    const url = `${BASE}/user_reels?user_id=${encodeURIComponent(user_id)}`;
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }

      const edges = body?.data?.xdt_api__v1__clips__user__connection_v2?.edges ?? [];
      const rawItems = edges.length > 0
        ? edges.map(e => e?.node?.media).filter(Boolean)
        : (body?.data?.items ?? body?.items ?? []);

      const videoItems = rawItems.filter(i =>
        i.media_type === 2 || i.product_type === 'clips' || i.is_video === true || i.video_url
      );

      reelsResult = {
        url,
        status: r.status,
        ok: r.ok,
        edgesCount: edges.length,
        totalItems: rawItems.length,
        videoItems: videoItems.length,
        topLevelKeys: typeof body === 'object' && body ? Object.keys(body) : [],
        dataKeys: typeof body?.data === 'object' && body?.data ? Object.keys(body.data) : [],
        sampleMedia: rawItems[0] ? {
          media_type: rawItems[0].media_type,
          product_type: rawItems[0].product_type,
          play_count: rawItems[0].play_count,
          taken_at: rawItems[0].taken_at,
        } : null,
      };
    } catch (e) {
      reelsResult = { url: `${BASE}/user_reels?user_id=${user_id}`, status: 'ERROR', ok: false, body: e.message };
    }
  }

  return res.json({
    username: username ?? '(skipped)',
    flushed,
    cachedUid,
    resolved_user_id: user_id,
    step1_userinfo: userinfoResult,
    step2_reels: reelsResult,
  });
};
