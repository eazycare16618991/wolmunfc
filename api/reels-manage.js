/**
 * 계정 관리 API (PIN 보호)
 *
 * GET    /api/reels-manage?pin=1234&category=food          → 계정 목록 조회
 * POST   /api/reels-manage  {pin, category, username}      → username → user_id 자동 조회 후 저장
 * DELETE /api/reels-manage?pin=1234&category=food&username=xxx → 계정 삭제
 *
 * 저장 포맷: [{ username: "xxx", user_id: "6815352271" }, ...]
 */
const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');

const PIN = process.env.REELS_ADMIN_PIN ?? '1234';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-cheapest.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1/instagram`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pin = req.query.pin ?? req.body?.pin;
  if (pin !== PIN) return res.status(401).json({ error: 'PIN이 틀렸습니다.' });

  const category = req.query.category ?? req.body?.category;
  if (!category) return res.status(400).json({ error: 'category 필수' });

  const kvKey = `reels_accounts_v2_${category}`;

  let accounts;
  try { accounts = await kv.get(kvKey); } catch (_) {}
  accounts = accounts ?? DEFAULT_ACCOUNTS[category] ?? [];

  // GET — 계정 목록 조회
  if (req.method === 'GET') {
    return res.json({ category, accounts });
  }

  // POST — username 입력 → user_id 자동 조회 → 저장
  if (req.method === 'POST') {
    const username = (req.body?.username ?? '').replace(/^@/, '').trim();
    if (!username) return res.status(400).json({ error: 'username 필수' });

    const alreadyExists = accounts.some(a => a.username === username);
    if (alreadyExists) return res.status(409).json({ error: '이미 등록된 계정입니다.' });

    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'RAPIDAPI_KEY 환경변수가 없습니다.' });
    }

    // userinfo API로 user_id 조회
    let user_id;
    try {
      const infoRes = await fetch(
        `${BASE_URL}/userinfo?username_or_id_or_url=${encodeURIComponent(username)}`,
        { headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST } }
      );
      if (!infoRes.ok) {
        const t = await infoRes.text();
        return res.status(infoRes.status).json({ error: `userinfo API 오류: ${t}` });
      }
      const info = await infoRes.json();
      // 다양한 응답 구조 대응
      user_id = String(
        info?.data?.id ?? info?.data?.pk ?? info?.id ?? info?.pk ?? info?.user?.id ?? ''
      );
    } catch (err) {
      return res.status(500).json({ error: 'user_id 조회 실패: ' + err.message });
    }

    if (!user_id) {
      return res.status(404).json({ error: `@${username} 계정을 찾을 수 없습니다.` });
    }

    accounts = [...accounts, { username, user_id }];
    await kv.set(kvKey, accounts);
    clearCache(category);

    return res.json({ ok: true, accounts });
  }

  // DELETE — username 기준 삭제
  if (req.method === 'DELETE') {
    const username = (req.query.username ?? '').replace(/^@/, '').trim();
    if (!username) return res.status(400).json({ error: 'username 필수' });

    accounts = accounts.filter(a => a.username !== username);
    await kv.set(kvKey, accounts);
    clearCache(category);

    return res.json({ ok: true, accounts });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

function clearCache(category) {
  try {
    const timeBucket = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
    kv.del(`reels_v2_${category}_${timeBucket}`).catch(() => {});
  } catch (_) {}
}
