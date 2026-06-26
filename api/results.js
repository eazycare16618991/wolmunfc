const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.query.pin !== '1234') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const votes = [];
  const voters = [];
  for (let i = 0; i < 2; i++) {
    votes.push(Number(await kv.get('wm_mvp_count_' + i)) || 0);
    voters.push(await kv.lrange('wm_mvp_voters_' + i, 0, -1));
  }

  res.status(200).json({ votes, voters });
};
