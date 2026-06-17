/**
 * 카테고리별 기본 내장 계정 목록 (실존하는 공식/대형 계정 위주)
 */
const DEFAULT_ACCOUNTS = {
  food: [
    { username: 'paik_jk' },           // 백종원
    { username: 'maangchi' },           // 망치 요리 (7M+)
    { username: 'cooking_tree' },       // 쿠킹트리
    { username: 'youn_kitchen' },       // 윤식당
    { username: 'oddfoodlab' },         // 오드푸드랩
    { username: 'baemin_official' },    // 배달의민족
  ],
  beauty: [
    { username: 'pony.makeup' },        // 포니 메이크업 (7M+)
    { username: 'risabae' },            // 이사배
    { username: 'etudehouse' },         // 에뛰드하우스 (공식)
    { username: 'innisfree_official' }, // 이니스프리 (공식)
    { username: 'laneige_official' },   // 라네즈 (공식)
    { username: '3ce_style' },          // 3CE 코스메틱
  ],
  fashion: [
    { username: 'stylenanda' },         // 스타일난다
    { username: 'ader_error' },         // 아더에러
    { username: 'musinsa' },            // 무신사
    { username: 'levis_korea' },        // 리바이스 코리아
    { username: 'zara' },               // 자라 (글로벌)
  ],
  fitness: [
    { username: 'nike_korea' },         // 나이키 코리아
    { username: 'lululemon' },          // 룰루레몬 (글로벌)
    { username: 'under_armour' },       // 언더아머 (글로벌)
    { username: 'kkukkuduck' },         // 꾹꾹덕
    { username: 'gymshark' },           // 짐샤크 (글로벌, 활발)
  ],
  travel: [
    { username: 'visitkorea' },         // 한국관광공사 (공식)
    { username: 'visitseoul' },         // 서울관광재단 (공식)
    { username: 'korea.travel' },       // 한국 여행
    { username: 'airbnb' },             // 에어비앤비 (글로벌, 여행 릴스 많음)
    { username: 'lonelyplanet' },       // 론리플래닛 (글로벌)
  ],
  lifestyle: [
    { username: 'ikea_korea' },         // 이케아 코리아 (공식)
    { username: 'ohou.se' },            // 오늘의집
    { username: 'starbucks_korea' },    // 스타벅스 코리아 (공식)
    { username: 'coupang_official' },   // 쿠팡
    { username: 'olive_young_official' }, // 올리브영
  ],
  pet: [
    { username: 'tofu_corgi' },         // 토푸 코기 (1.7M+)
    { username: 'jiffpom' },            // 지프팜 (유명 포메, 10M+)
    { username: 'itsdougthepug' },      // 더그 더 퍼그 (6M+)
    { username: 'dogtionary_official' }, // 도그셔너리
    { username: 'nyanpuu' },            // 냥푸 (한국 고양이)
  ],
  parenting: [
    { username: 'babysitter_korea' },
    { username: 'mamaedu_official' },
    { username: 'pinkfong' },           // 핑크퐁 (베이비샤크, 공식)
    { username: 'babysharkofficialpage' }, // 아기상어
  ],
  tutorial: [
    { username: 'cooking_tree' },       // 쿠킹트리 ✓
    { username: 'maangchi' },           // 망치 요리 ✓
    { username: 'paik_jk' },            // 백종원 ✓
    { username: 'tasty' },              // 버즈피드 Tasty (글로벌, 레시피 릴스)
    { username: 'buzzfeedtasty' },      // 타스티
  ],
  beforeafter: [
    { username: 'pony.makeup' },        // 포니 ✓
    { username: 'etudehouse' },         // 에뛰드
    { username: 'innisfree_official' }, // 이니스프리
    { username: 'banilaco_official' },  // 바닐라코
    { username: 'sulwhasoo' },          // 설화수
  ],
  challenge: [
    { username: 'studiochoom' },        // 스튜디오 춤 (Mnet 공식)
    { username: 'smtown' },             // SM 엔터테인먼트 (공식)
    { username: 'hybe_labels' },        // HYBE (방탄소년단 소속사)
    { username: 'ygentertainment' },    // YG 엔터테인먼트
    { username: 'jypentertainment' },   // JYP 엔터테인먼트
  ],
  vlog: [
    { username: 'maangchi' },           // 망치 ✓
    { username: 'visitkorea' },         // 한국관광공사 ✓
    { username: 'chaeundiary' },
    { username: 'natgeo' },             // 내셔널지오그래픽
    { username: 'airbnb' },             // 에어비앤비
  ],
  unboxing: [
    { username: 'unboxinglab_kr' },
    { username: 'lego' },               // 레고 (공식, 언박싱 많음)
    { username: 'samsung' },            // 삼성 (공식)
    { username: 'apple' },              // 애플 (공식)
  ],
  cleaning: [
    { username: 'mariekondo' },         // 마리 콘도 (4.1M, 정리정돈)
    { username: 'mrshinchhome' },       // Mrs. Hinch (4.2M, 영국 청소 인플루언서)
    { username: 'thehomeedit' },        // The Home Edit (5.7M, 정리수납)
    { username: 'scrubdaddy' },         // 스크럽 대디 (청소용품 브랜드)
    { username: 'clean_bros_kr' },      // 청소 브로스 (한국)
    { username: 'cleaningbros' },       // 청소 브로스
    { username: 'housekeeper_clean' },  // 한국 청소 계정
    { username: 'sodasoda_clean' },     // 소다소다 (한국 청소)
  ],
  storytime: [
    { username: 'natgeo' },             // 내셔널지오그래픽
    { username: 'bbcnews' },            // BBC 뉴스
    { username: 'goodnews_k' },
    { username: 'ytn_news' },           // YTN 뉴스
  ],
};

module.exports = { DEFAULT_ACCOUNTS };
