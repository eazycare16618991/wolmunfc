const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');
const { resolveUserId } = require('./reels-userinfo');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1/instagram`;
const CACHE_TTL = 2 * 60 * 60; // 2시간

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { category = 'food', period = '30', sort = 'views' } = req.query;

  if (!RAPIDAPI_KEY) {
    return res.status(500).json({
      error: 'RAPIDAPI_KEY 환경변수가 없습니다. Vercel 대시보드에서 추가하세요.'
    });
  }

  // KV 커스텀 계정 → 없으면 DEFAULT 사용
  let accounts;
  try { accounts = await kv.get(`reels_accounts_v2_${category}`); } catch (_) {}
  accounts = accounts ?? DEFAULT_ACCOUNTS[category] ?? [];

  if (accounts.length === 0) {
    return res.json({ items: [], total: 0, accountCount: 0,
      notice: `"${category}" 카테고리에 등록된 계정이 없습니다.` });
  }

  // user_id 없는 계정 자동 resolve (병렬)
  const resolved = await Promise.all(
    accounts.map(async (acc) => {
      if (acc.user_id) return acc;
      const uid = await resolveUserId(acc.username ?? acc);
      return uid ? { username: acc.username ?? acc, user_id: uid } : null;
    })
  );
  const validAccounts = resolved.filter(Boolean);

  if (validAccounts.length === 0) {
    return res.json({ items: [], total: 0, accountCount: accounts.length,
      notice: 'user_id를 조회할 수 없습니다. userinfo 엔드포인트를 확인해주세요.' });
  }

  // 2시간 캐시
  const bucket = Math.floor(Date.now() / (CACHE_TTL * 1000));
  const cacheKey = `reels_v3_${category}_${bucket}`;

  let rawItems;
  try { rawItems = await kv.get(cacheKey); } catch (_) {}

  if (!rawItems) {
    const results = await Promise.allSettled(
      validAccounts.map(acc => fetchUserReels(acc.user_id, acc.username))
    );

    rawItems = [];
    for (const r of results) {
      if (r.status === 'fulfilled') rawItems.push(...r.value);
    }

    // 중복 제거
    const seen = new Set();
    rawItems = rawItems.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    try { await kv.setex(cacheKey, CACHE_TTL, rawItems); } catch (_) {}
  }

  const result = applyFilter(rawItems, parseInt(period, 10), sort);
  return res.json({ ...result, accountCount: validAccounts.length });
};

async function fetchUserReels(user_id, username) {
  const url = `${BASE_URL}/user_reels?user_id=${encodeURIComponent(user_id)}`;
  const apiRes = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  if (!apiRes.ok) throw new Error(`${username} 조회 실패: ${apiRes.status}`);
  const data = await apiRes.json();
  return extractItems(data, username);
}

function extractItems(data, fallbackUsername) {
  // user_reels 실제 응답 구조: data.xdt_api__v1__clips__user__connection_v2.edges[].node.media
  const edges = data?.data?.xdt_api__v1__clips__user__connection_v2?.edges ?? [];
  const raw = edges.length > 0
    ? edges.map(e => e?.node?.media).filter(Boolean)
    : (data?.data?.items ?? data?.items ?? []);

  return raw
    .filter(item => item.media_type === 2 || item.product_type === 'clips' || item.is_video === true || item.video_url)
    .map(item => ({
      id: String(item.id ?? item.pk ?? Math.random()),
      shortcode: item.code ?? item.shortcode ?? '',
      takenAt: item.taken_at ?? 0,
      viewCount: item.play_count ?? item.video_view_count ?? item.view_count ?? 0,
      likeCount: item.like_count ?? 0,
      commentCount: item.comment_count ?? 0,
      thumbnail:
        item.image_versions2?.candidates?.[0]?.url ??
        item.thumbnail_url ?? item.display_url ?? '',
      caption:
        item.caption?.text ??
        item.edge_media_to_caption?.edges?.[0]?.node?.text ?? '',
      username: item.user?.username ?? item.owner?.username ?? fallbackUsername,
      fullName: item.user?.full_name ?? item.owner?.full_name ?? '',
      profilePic: item.user?.profile_pic_url ?? item.owner?.profile_pic_url ?? '',
    }));
}

function applyFilter(items, periodDays, sort) {
  const cutoff = periodDays > 0 ? Date.now() / 1000 - periodDays * 86400 : 0;
  let list = periodDays > 0 ? items.filter(i => i.takenAt >= cutoff) : [...items];
  list.sort((a, b) => sort === 'views' ? b.viewCount - a.viewCount : b.takenAt - a.takenAt);
  return { items: list.slice(0, 24), total: list.length };
}
