// Static trivia question pool. Korean only. Lunch-table tone — keep it light, avoid
// politics/religion/dated company info. Schema is immutable: id is a stable identifier
// used for replay/debug, never displayed.
//
// Adding questions: append to the array, give it a fresh id (kebab-case, descriptive).
// Don't reorder existing entries — server picks via seed-based shuffle, but the *pool*
// itself is sorted by id at runtime, so insertion order doesn't matter for determinism.

export type TriviaCategory = '한국상식' | '일반상식' | '과학' | '역사' | '문화';

export type TriviaQuestion = {
  id: string;
  category: TriviaCategory;
  question: string;
  choices: readonly [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
};

export const TRIVIA_POOL: readonly TriviaQuestion[] = [
  {
    id: 'kr-capital',
    category: '한국상식',
    question: '대한민국의 수도는?',
    choices: ['서울', '부산', '인천', '대전'],
    correctIndex: 0,
  },
  {
    id: 'kr-currency',
    category: '한국상식',
    question: '세종대왕이 만든 문자는?',
    choices: ['한자', '훈민정음', '이두', '향찰'],
    correctIndex: 1,
  },
  {
    id: 'kr-mountain',
    category: '한국상식',
    question: '한반도에서 가장 높은 산은?',
    choices: ['한라산', '지리산', '백두산', '설악산'],
    correctIndex: 2,
  },
  {
    id: 'kr-flag',
    category: '한국상식',
    question: '태극기 가운데 원의 빨간색이 의미하는 것은?',
    choices: ['땅', '음(陰)', '양(陽)', '하늘'],
    correctIndex: 2,
  },
  {
    id: 'world-largest-ocean',
    category: '일반상식',
    question: '세계에서 가장 큰 바다는?',
    choices: ['대서양', '인도양', '북극해', '태평양'],
    correctIndex: 3,
  },
  {
    id: 'world-longest-river',
    category: '일반상식',
    question: '세계에서 가장 긴 강은?',
    choices: ['나일강', '아마존강', '양쯔강', '미시시피강'],
    correctIndex: 0,
  },
  {
    id: 'world-tallest-mountain',
    category: '일반상식',
    question: '세계에서 가장 높은 산은?',
    choices: ['K2', '에베레스트', '킬리만자로', '몽블랑'],
    correctIndex: 1,
  },
  {
    id: 'world-eu-capital',
    category: '일반상식',
    question: '프랑스의 수도는?',
    choices: ['로마', '베를린', '파리', '마드리드'],
    correctIndex: 2,
  },
  {
    id: 'sci-water-formula',
    category: '과학',
    question: '물의 화학식은?',
    choices: ['CO₂', 'O₂', 'H₂', 'H₂O'],
    correctIndex: 3,
  },
  {
    id: 'sci-planet-count',
    category: '과학',
    question: '태양계 행성의 수는? (2006년 명왕성 분류 변경 이후)',
    choices: ['7개', '8개', '9개', '10개'],
    correctIndex: 1,
  },
  {
    id: 'sci-light-speed-unit',
    category: '과학',
    question: '빛의 속도와 가장 가까운 단위는?',
    choices: ['초속 30만km', '초속 3만km', '초속 300만km', '초속 3000km'],
    correctIndex: 0,
  },
  {
    id: 'sci-human-bones',
    category: '과학',
    question: '성인의 뼈 개수는 약 몇 개?',
    choices: ['106개', '156개', '206개', '256개'],
    correctIndex: 2,
  },
  {
    id: 'sci-blood-color',
    category: '과학',
    question: '사람 피의 빨간색을 만드는 단백질은?',
    choices: ['멜라닌', '헤모글로빈', '케라틴', '콜라겐'],
    correctIndex: 1,
  },
  {
    id: 'hist-hangeul',
    category: '역사',
    question: '한글이 반포된 해는?',
    choices: ['1446년', '1392년', '1592년', '1910년'],
    correctIndex: 0,
  },
  {
    id: 'hist-korea-war',
    category: '역사',
    question: '6·25 전쟁이 발발한 해는?',
    choices: ['1945년', '1948년', '1950년', '1953년'],
    correctIndex: 2,
  },
  {
    id: 'hist-joseon-founder',
    category: '역사',
    question: '조선을 건국한 인물은?',
    choices: ['왕건', '이성계', '정도전', '이방원'],
    correctIndex: 1,
  },
  {
    id: 'hist-ww2-end',
    category: '역사',
    question: '제2차 세계대전이 끝난 해는?',
    choices: ['1939년', '1941년', '1945년', '1950년'],
    correctIndex: 2,
  },
  {
    id: 'cult-olympic-rings',
    category: '문화',
    question: '올림픽 오륜기의 고리는 몇 개?',
    choices: ['4개', '5개', '6개', '7개'],
    correctIndex: 1,
  },
  {
    id: 'cult-mona-lisa',
    category: '문화',
    question: '"모나리자"를 그린 화가는?',
    choices: ['미켈란젤로', '레오나르도 다빈치', '라파엘로', '피카소'],
    correctIndex: 1,
  },
  {
    id: 'cult-shakespeare',
    category: '문화',
    question: '"햄릿"을 쓴 작가는?',
    choices: ['괴테', '톨스토이', '셰익스피어', '도스토옙스키'],
    correctIndex: 2,
  },
  {
    id: 'cult-bts-debut',
    category: '문화',
    question: 'BTS가 데뷔한 해는?',
    choices: ['2010년', '2013년', '2015년', '2017년'],
    correctIndex: 1,
  },
  {
    id: 'cult-kimchi-origin',
    category: '문화',
    question: '김치의 빨간 양념에 들어가는 핵심 재료는?',
    choices: ['고추가루', '간장', '된장', '카레가루'],
    correctIndex: 0,
  },
  {
    id: 'sci-fastest-animal',
    category: '과학',
    question: '지구상에서 가장 빠른 동물은?',
    choices: ['치타', '송골매', '말', '돌고래'],
    correctIndex: 1,
  },
  {
    id: 'kr-han-river-bridge',
    category: '한국상식',
    question: '서울 한강을 건너는 다리 중 가장 먼저 만들어진 다리는?',
    choices: ['반포대교', '한강대교', '성수대교', '동작대교'],
    correctIndex: 1,
  },
  {
    id: 'world-smallest-country',
    category: '일반상식',
    question: '세계에서 가장 작은 나라는?',
    choices: ['모나코', '바티칸시국', '산마리노', '리히텐슈타인'],
    correctIndex: 1,
  },
  {
    id: 'sci-dna-shape',
    category: '과학',
    question: 'DNA의 구조 모양은?',
    choices: ['직선', '나선형', '이중나선', '삼중나선'],
    correctIndex: 2,
  },
  {
    id: 'kr-traditional-clothes',
    category: '한국상식',
    question: '한국 전통 의상의 이름은?',
    choices: ['기모노', '치파오', '한복', '아오자이'],
    correctIndex: 2,
  },
  {
    id: 'world-largest-desert',
    category: '일반상식',
    question: '세계에서 가장 넓은 사막은?',
    choices: ['사하라 사막', '고비 사막', '아라비아 사막', '남극 사막'],
    correctIndex: 3,
  },
  {
    id: 'cult-coffee-origin',
    category: '문화',
    question: '커피의 원산지로 알려진 나라는?',
    choices: ['브라질', '콜롬비아', '에티오피아', '베트남'],
    correctIndex: 2,
  },
  {
    id: 'sci-sun-color',
    category: '과학',
    question: '태양빛이 모두 합쳐졌을 때 실제로 보이는 색은?',
    choices: ['노란색', '주황색', '하얀색', '빨간색'],
    correctIndex: 2,
  },
] as const;

// Stable, sorted-by-id view used by the seed-based picker. Sorting at module load
// pins the pick order regardless of array insertion order — adding a new question
// at the end of TRIVIA_POOL will *not* change the seed→question mapping for any
// id that was already there (only the slot a new id occupies in alphabetical order).
export const TRIVIA_POOL_SORTED: readonly TriviaQuestion[] = [...TRIVIA_POOL].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
);

export function getQuestionById(id: string): TriviaQuestion | undefined {
  return TRIVIA_POOL.find((q) => q.id === id);
}
