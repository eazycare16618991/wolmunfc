/**
 * Instagram 계정 username → user_id 변환
 * 여러 URL 패턴을 순서대로 시도해서 작동하는 것 사용
 */
const { kv } = require('@vercel/kv');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

const HEADERS = () => ({
  'X-RapidAPI-Key': RAPIDAPI_KEY,
  'X-RapidAPI-Host': RAPIDAPI_HOST,
  'Content-Type': 'application/json',
});

// username → user_id (KV 영구 캐시 + API 폴백)
async function resolveUserId(username) {
  if (!username || !RAPIDAPI_KEY) return null;

  // KV 캐시 확인 (영구 저장)
  try {
    const cached = await kv.get(`uid_${username}`);
    if (cached) return String(cached);
  } catch (_) {}

  // userinfo 엔드포인트 — 올바른 URL: /user/{username} (경로 파라미터)
  const patterns = [
    `${BASE}/user/${encodeURIComponent(username)}`,
    // 폴백: user_medias로 user.id 추출
    `${BASE}/user_medias?username_or_id_or_url=${encodeURIComponent(username)}&count=1`,
    `${BASE}/user_medias?username=${encodeURIComponent(username)}&count=1`,
  ];

  for (const url of patterns) {
    try {
      const res = await fetch(url, { headers: HEADERS() });
      if (!res.ok) continue;
      const data = await res.json();

      const uid = extractUserId(data);
      if (uid) {
        // 성공한 패턴 + user_id 캐시 저장
        await kv.set(`uid_${username}`, uid).catch(() => {});
        return String(uid);
      }
    } catch (_) {}
  }

  return null; // 모두 실패
}

// 다양한 API 응답 구조에서 user_id 추출
function extractUserId(data) {
  return (
    data?.data?.id ??
    data?.data?.pk ??
    data?.id ??
    data?.pk ??
    data?.user?.id ??
    data?.user?.pk ??
    data?.data?.user?.id ??
    data?.data?.user?.pk ??
    // user_medias 응답의 첫 아이템 user 정보
    data?.data?.items?.[0]?.user?.id ??
    data?.data?.items?.[0]?.user?.pk ??
    data?.items?.[0]?.user?.id ??
    null
  );
}

module.exports = { resolveUserId };
