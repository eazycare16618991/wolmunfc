const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';
const REELS_API_URL = `https://${RAPIDAPI_HOST}/api/instagram/reels`;
const CACHE_TTL = 24 * 60 * 60; // 24시간 (무료 1,000 req/월 절약)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { category = 'food', period = '30', sort = 'views' } = req.query;

  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY 환경변수가 없습니다.' });
  }

  let accounts;
  try { accounts = await kv.get(`reels_accounts_v2_${category}`); } catch (_) {}
  accounts = accounts ?? DEFAULT_ACCOUNTS[category] ?? [];

  if (accounts.length === 0) {
    return res.json({ items: [], total: 0, accountCount: 0,
      notice: `"${category}" 카테고리에 등록된 계정이 없습니다.` });
  }

  const usernames = accounts.map(a => a.username ?? a).filter(Boolean);

  // 24시간 캐시
  const bucket = Math.floor(Date.now() / (CACHE_TTL * 1000));
  const cacheKey = `reels_v6_${category}_${bucket}`;

  let rawItems;
  try { rawItems = await kv.get(cacheKey); } catch (_) {}

  if (!rawItems) {
    const results = await Promise.allSettled(
      usernames.map(username => fetchUserReels(username))
    );

    rawItems = [];
    for (const r of results) {
      if (r.status === 'fulfilled') rawItems.push(...r.value);
    }

    const seen = new Set();
    rawItems = rawItems.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    try { await kv.setex(cacheKey, CACHE_TTL, rawItems); } catch (_) {}
  }

  const result = applyFilter(rawItems, parseInt(period, 10), sort);
  return res.json({ ...result, accountCount: usernames.length });
};

async function fetchUserReels(username) {
  const apiRes = await fetch(REELS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    body: JSON.stringify({ username, maxId: '' }),
  });
  if (!apiRes.ok) throw new Error(`${username}: ${apiRes.status}`);
  const data = await apiRes.json();
  return extractItems(data, username);
}

function extractItems(data, fallbackUsername) {
  // instagram120 응답: result.edges[].node.media
  const edges = data?.result?.edges ?? [];
  const raw = edges.map(e => e?.node?.media).filter(Boolean);

  return raw
    .filter(item => item.media_type === 2 || item.product_type === 'clips')
    .map(item => {
      let takenAt = 0;
      if (item.taken_at > 0) {
        takenAt = item.taken_at;
      } else {
        try {
          const pk = BigInt(String(item.pk).replace(/\D/g, ''));
          const now = Math.floor(Date.now() / 1000);
          // 새 Instagram ID(~62비트): 상위 31비트가 Unix seconds 직접 표현
          const ts31 = Number(pk >> 31n);
          // 구 Instagram ID: >> 23 + Instagram epoch
          const ts23 = Number(pk >> 23n) + 1314220021;
          if (ts31 > 1300000000 && ts31 <= now + 86400) takenAt = ts31;
          else if (ts23 > 1300000000 && ts23 <= now + 86400) takenAt = ts23;
        } catch (_) {}
      }

      return {
        id: String(item.id ?? item.pk ?? Math.random()),
        shortcode: item.code ?? item.shortcode ?? '',
        takenAt,
        viewCount: item.play_count ?? item.video_view_count ?? 0,
        likeCount: item.like_count ?? 0,
        commentCount: item.comment_count ?? 0,
        thumbnail: item.image_versions2?.candidates?.[0]?.url ?? '',
        caption: item.caption?.text ?? '',
        username: item.user?.username ?? fallbackUsername,
        fullName: item.user?.full_name ?? '',
        profilePic: item.user?.profile_pic_url ?? '',
      };
    });
}

function applyFilter(items, periodDays, sort) {
  const cutoff = periodDays > 0 ? Date.now() / 1000 - periodDays * 86400 : 0;
  let list = periodDays > 0
    ? items.filter(i => i.takenAt > 0 && i.takenAt >= cutoff)
    : [...items];
  list.sort((a, b) => sort === 'views' ? b.viewCount - a.viewCount : b.takenAt - a.takenAt);
  return { items: list.slice(0, 24), total: list.length };
}
