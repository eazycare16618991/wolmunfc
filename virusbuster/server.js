const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';

app.get('/api/search', async (req, res) => {
  const { query = '바이러스버스', sort = 'asc', display = 40, start = 1 } = req.query;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: 'API 키가 설정되지 않았습니다.',
      message: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 설정해주세요.'
    });
  }

  try {
    const response = await axios.get('https://openapi.naver.com/v1/search/shop.json', {
      params: { query, sort, display, start },
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      },
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
