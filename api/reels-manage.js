/**
 * 계정 관리 API (PIN 보호)
 *
 * GET    /api/reels-manage?pin=1234&category=food       → 계정 목록 조회
 * POST   /api/reels-manage  {pin, category, username}   → 계정 추가 (user_id 자동 조회)
 * DELETE /api/reels-manage?pin=1234&category=food&username=xxx → 계정 삭제
 */
const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');
const { resolveUserId } = require('./reels-userinfo');

const PIN = process.env.REELS_ADMIN_PIN ?? '1234';

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

  if (req.method === 'GET') {
    return res.json({ category, accounts });
  }

  if (req.method === 'POST') {
    const username = (req.body?.username ?? '').replace(/^@/, '').trim();
    if (!username) return res.status(400).json({ error: 'username 필수' });
    if (accounts.some(a => a.username === username))
      return res.status(409).json({ error: '이미 등록된 계정입니다.' });

    // user_id 자동 조회 (여러 패턴 시도)
    const user_id = await resolveUserId(username);

    accounts = [...accounts, { username, user_id: user_id ?? null }];
    await kv.set(kvKey, accounts);
    clearCache(category);

    return res.json({ ok: true, accounts, resolved: !!user_id });
  }

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
    const bucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    kv.del(`reels_v6_${category}_${bucket}`).catch(() => {});
  } catch (_) {}
}
