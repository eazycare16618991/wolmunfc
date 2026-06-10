const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.query.pin !== '1234') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const keys = ['wm_mvp_voted_names'];
  for (let i = 0; i < 3; i++) {
    keys.push('wm_mvp_count_' + i, 'wm_mvp_voters_' + i);
  }
  await kv.del(...keys);

  res.status(200).json({ ok: true });
};
