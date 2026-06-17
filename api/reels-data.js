const { kv } = require('@vercel/kv');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';
const CACHE_TTL_SECONDS = 2 * 60 * 60; // 2시간

// 카테고리 → 해시태그 매핑
const CATEGORY_HASHTAGS = {
  food:        '맛집',
  beauty:      '뷰티',
  fashion:     '패션',
  fitness:     '운동',
  travel:      '여행',
  lifestyle:   '일상',
  pet:         '반려견',
  parenting:   '육아',
  tutorial:    'tutorial',
  beforeafter: 'beforeandafter',
  challenge:   'challenge',
  vlog:        'vlog',
  unboxing:    'unboxing',
  storytime:   'storytime',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { category = 'food', period = '30', sort = 'views', cursor = '' } = req.query;

  if (!RAPIDAPI_KEY) {
    return res.status(500).json({
      error: 'RAPIDAPI_KEY 환경변수가 설정되지 않았습니다. Vercel 대시보드에서 환경변수를 추가해주세요.'
    });
  }

  const hashtag = CATEGORY_HASHTAGS[category] || category;

  // 2시간 단위 캐시 버킷
  const timeBucket = Math.floor(Date.now() / (CACHE_TTL_SECONDS * 1000));
  const cacheKey = `reels_v1_${hashtag}_${timeBucket}`;

  // KV 캐시 조회
  let rawItems = null;
  try {
    rawItems = await kv.get(cacheKey);
  } catch (_) {}

  if (!rawItems) {
    if (!fetch) {
      // Node 18 미만 환경 대비
      const nodeFetch = require('node-fetch');
      global.fetch = nodeFetch;
    }

    const apiUrl =
      `https://${RAPIDAPI_HOST}/v1.2/hashtag?hashtag=${encodeURIComponent(hashtag)}` +
      (cursor ? `&next=${encodeURIComponent(cursor)}` : '');

    let apiRes;
    try {
      apiRes = await fetch(apiUrl, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'API 요청 실패: ' + err.message });
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Instagram API 오류 ${apiRes.status}: ${errText}` });
    }

    const data = await apiRes.json();
    rawItems = extractItems(data);

    try {
      await kv.setex(cacheKey, CACHE_TTL_SECONDS, rawItems);
    } catch (_) {}
  }

  return res.json(applyFilter(rawItems, parseInt(period, 10), sort));
};

function extractItems(data) {
  const raw = data?.data?.items ?? data?.items ?? [];
  return raw
    .filter(item => item.media_type === 2 || item.is_video === true)
    .map(item => ({
      id: String(item.id ?? item.pk ?? ''),
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
      username: item.user?.username ?? item.owner?.username ?? '',
      fullName: item.user?.full_name ?? item.owner?.full_name ?? '',
      profilePic: item.user?.profile_pic_url ?? item.owner?.profile_pic_url ?? '',
    }));
}

function applyFilter(items, periodDays, sort) {
  const cutoff = periodDays > 0 ? Date.now() / 1000 - periodDays * 86400 : 0;
  let list = periodDays > 0 ? items.filter(i => i.takenAt >= cutoff) : [...items];

  if (sort === 'views') {
    list.sort((a, b) => b.viewCount - a.viewCount);
  } else {
    list.sort((a, b) => b.takenAt - a.takenAt);
  }

  return { items: list.slice(0, 24), total: list.length };
}
