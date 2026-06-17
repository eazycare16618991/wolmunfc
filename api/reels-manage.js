/**
 * 계정 관리 API (PIN 보호)
 *
 * GET  /api/reels-manage?pin=1234&category=food          → 계정 목록 조회
 * POST /api/reels-manage  {pin, category, username}      → 계정 추가
 * DELETE /api/reels-manage?pin=1234&category=food&username=xxx → 계정 삭제
 */
const { kv } = require('@vercel/kv');
const { DEFAULT_ACCOUNTS } = require('./reels-accounts');

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

  const kvKey = `reels_accounts_${category}`;

  // 현재 목록 로드
  let accounts;
  try { accounts = await kv.get(kvKey); } catch (_) {}
  accounts = accounts ?? DEFAULT_ACCOUNTS[category] ?? [];

  // GET
  if (req.method === 'GET') {
    return res.json({ category, accounts });
  }

  // POST — 계정 추가
  if (req.method === 'POST') {
    const username = (req.body?.username ?? '').replace(/^@/, '').trim();
    if (!username) return res.status(400).json({ error: 'username 필수' });
    if (accounts.includes(username)) return res.status(409).json({ error: '이미 등록된 계정입니다.' });

    accounts = [...accounts, username];
    await kv.set(kvKey, accounts);

    // 해당 카테고리 캐시 삭제
    try {
      const timeBucket = Math.floor(Date.now() / (2 * 60 * 60 * 1000));
      await kv.del(`reels_v2_${category}_${timeBucket}`);
    } catch (_) {}

    return res.json({ ok: true, accounts });
  }

  // DELETE — 계정 삭제
  if (req.method === 'DELETE') {
    const username = (req.query.username ?? '').replace(/^@/, '').trim();
    if (!username) return res.status(400).json({ error: 'username 필수' });

    accounts = accounts.filter(u => u !== username);
    await kv.set(kvKey, accounts);
    return res.json({ ok: true, accounts });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
