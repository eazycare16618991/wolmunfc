/**
 * 카테고리별 기본 내장 계정 목록
 * user_id는 첫 조회 시 자동 캐싱됨 — 여기서는 username만 설정
 */
const DEFAULT_ACCOUNTS = {
  food: [
    { username: 'paik_jk' },          // 백종원
    { username: 'maangchi' },          // 망치 요리
    { username: 'cooking_tree' },      // 쿠킹트리
    { username: 'youn_kitchen' },      // 윤식당
    { username: 'oddfoodlab' },        // 오드푸드랩
  ],
  beauty: [
    { username: 'pony.makeup' },       // 포니
    { username: 'risabae' },           // 리사배
    { username: 'heizle' },            // 헤이즐
    { username: 'lamuqe' },
  ],
  fashion: [
    { username: 'stylenanda' },        // 스타일난다
    { username: 'leesoo_official' },
    { username: 'iam_youngji' },
  ],
  fitness: [
    { username: 'kkukkuduck' },
    { username: 'trainer_ryu' },
    { username: 'gymkoreabro' },
  ],
  travel: [
    { username: 'visitkorea' },        // 한국관광공사
    { username: 'jejuisland.official' },
    { username: 'travel_korea_' },
  ],
  lifestyle: [
    { username: 'ondal_official' },
    { username: 'dailyseoul' },
    { username: 'slow_hyun' },
  ],
  pet: [
    { username: 'tofu_corgi' },
    { username: 'dogtionary_official' },
    { username: 'cat_catze' },
  ],
  parenting: [
    { username: 'babysitter_korea' },
    { username: 'mamaedu_official' },
  ],
  tutorial: [
    { username: 'cooking_tree' },
    { username: 'hmr_official' },
  ],
  beforeafter: [
    { username: 'banilaco_official' },
    { username: 'dasombeauty' },
  ],
  challenge: [
    { username: 'studiochoom' },       // 스튜디오 춤
    { username: 'mbcplus_tv' },
  ],
  vlog: [
    { username: 'chaeundiary' },
    { username: 'soheejoo' },
  ],
  unboxing: [
    { username: 'unboxinglab_kr' },
  ],
  storytime: [
    { username: 'goodnews_k' },
    { username: 'korean_story' },
  ],
};

module.exports = { DEFAULT_ACCOUNTS };
