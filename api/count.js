const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  let total = 0;
  for (let i = 0; i < 2; i++) {
    total += Number(await kv.get('wm_mvp_count_' + i)) || 0;
  }
  res.status(200).json({ count: total });
};
