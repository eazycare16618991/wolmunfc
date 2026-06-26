const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.query.pin !== '1234') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const idx = Number(req.query.candidate);
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';

  if (![0, 1].includes(idx) || !name) {
    res.status(400).json({ error: 'invalid request' });
    return;
  }

  const removed = await kv.lrem('wm_mvp_voters_' + idx, 0, name);
  if (removed > 0) {
    await kv.decrby('wm_mvp_count_' + idx, removed);
  }
  await kv.srem('wm_mvp_voted_names', name);

  res.status(200).json({ ok: true, removed });
};
