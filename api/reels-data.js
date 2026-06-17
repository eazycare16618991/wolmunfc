const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');

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
      error: 'RAPIDAPI_KEY 환경변수가 없습니다. Vercel 대시보드 → Settings → Environment Variables에서 추가하세요.'
    });
  }

  // KV에 저장된 커스텀 계정 목록 조회 (없으면 DEFAULT_ACCOUNTS 사용)
  let accounts;
  try {
    accounts = await kv.get(`reels_accounts_${category}`);
  } catch (_) {}
  accounts = accounts ?? DEFAULT_ACCOUNTS[category] ?? [];

  if (accounts.length === 0) {
    return res.json({
      items: [],
      total: 0,
      notice: `"${category}" 카테고리에 등록된 계정이 없습니다. /api/reels-manage 로 계정을 추가하세요.`
    });
  }

  // 2시간 캐시 키
  const timeBucket = Math.floor(Date.now() / (CACHE_TTL * 1000));
  const cacheKey = `reels_v2_${category}_${timeBucket}`;

  let rawItems;
  try { rawItems = await kv.get(cacheKey); } catch (_) {}

  if (!rawItems) {
    // 계정별 릴스 병렬 조회
    const results = await Promise.allSettled(
      accounts.map(username => fetchUserReels(username))
    );

    rawItems = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        rawItems.push(...r.value);
      }
    }

    // id 기준 중복 제거
    const seen = new Set();
    rawItems = rawItems.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    try { await kv.setex(cacheKey, CACHE_TTL, rawItems); } catch (_) {}
  }

  return res.json({ ...applyFilter(rawItems, parseInt(period, 10), sort), accountCount: accounts.length });
};

async function fetchUserReels(username) {
  const url = `${BASE_URL}/user_reels?username_or_id_or_url=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  if (!res.ok) throw new Error(`${username} 조회 실패: ${res.status}`);
  const data = await res.json();
  return extractItems(data, username);
}

function extractItems(data, fallbackUsername) {
  const raw = data?.data?.items ?? data?.items ?? [];
  return raw
    .filter(item => item.media_type === 2 || item.is_video === true || item.video_url)
    .map(item => ({
      id: String(item.id ?? item.pk ?? Math.random()),
      shortcode: item.code ?? item.shortcode ?? '',
      takenAt: item.taken_at ?? 0,
      viewCount: item.video_view_count ?? item.play_count ?? item.view_count ?? 0,
      likeCount: item.like_count ?? 0,
      commentCount: item.comment_count ?? 0,
      thumbnail:
        item.image_versions2?.candidates?.[0]?.url ??
        item.thumbnail_url ??
        item.display_url ??
        '',
      caption:
        item.caption?.text ??
        item.edge_media_to_caption?.edges?.[0]?.node?.text ??
        '',
      username: item.user?.username ?? item.owner?.username ?? fallbackUsername,
      fullName: item.user?.full_name ?? item.owner?.full_name ?? '',
      profilePic: item.user?.profile_pic_url ?? item.owner?.profile_pic_url ?? '',
    }));
}

function applyFilter(items, periodDays, sort) {
  const cutoff = periodDays > 0 ? Date.now() / 1000 - periodDays * 86400 : 0;
  let list = periodDays > 0 ? items.filter(i => i.takenAt >= cutoff) : [...items];

  list.sort((a, b) => sort === 'views'
    ? b.viewCount - a.viewCount
    : b.takenAt - a.takenAt
  );

  return { items: list.slice(0, 24), total: list.length };
}
