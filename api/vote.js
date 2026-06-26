const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const { candidate, name } = req.body || {};
  const idx = Number(candidate);
  const voterName = typeof name === 'string' ? name.trim() : '';

  if (![0, 1].includes(idx) || !voterName) {
    res.status(400).json({ error: 'invalid request' });
    return;
  }

  const added = await kv.sadd('wm_mvp_voted_names', voterName);
  if (!added) {
    res.status(409).json({ error: 'duplicate' });
    return;
  }

  await kv.incr('wm_mvp_count_' + idx);
  await kv.rpush('wm_mvp_voters_' + idx, voterName);

  res.status(200).json({ ok: true });
};
