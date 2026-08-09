import { describe, it, expect } from 'vitest';
import { TRIVIA_POOL, TRIVIA_GROUPS_BY_ID, TRIVIA_POOL_SORTED } from './trivia/questions';
import { NONSENSE_POOL, NONSENSE_GROUPS_BY_ID, NONSENSE_POOL_SORTED } from './nonsense/questions';
import { buildQuizPlan, difficultyQuota, refreshServedBag } from './trivia/server';

// 카피 규칙(questions.ts 헤더 주석: question ~40자, choices 모바일 한 줄, note ≤80자)의
// 회귀 방지용 하드 리밋. 현행 풀 최대치(question 44 / choice 14 / note 60)에
// 약간의 여유만 둔 값 — 이 한도를 넘기면 모바일에서 줄바꿈이 일어난다.
const MAX_QUESTION = 48;
const MAX_CHOICE = 16;
const MAX_NOTE = 80;

const POOLS = [
  { name: 'trivia', pool: TRIVIA_POOL },
  { name: 'nonsense', pool: NONSENSE_POOL },
] as const;

describe.each(POOLS)('$name question pool', ({ pool }) => {
  it('has unique ids', () => {
    const ids = pool.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question has 4 distinct choices and a valid correctIndex', () => {
    for (const q of pool) {
      expect(q.choices, q.id).toHaveLength(4);
      expect(new Set(q.choices).size, q.id).toBe(4);
      expect([0, 1, 2, 3], q.id).toContain(q.correctIndex);
    }
  });

  it('fits the mobile one-line copy limits', () => {
    for (const q of pool) {
      expect(q.question.length, `${q.id} question`).toBeLessThanOrEqual(MAX_QUESTION);
      for (const c of q.choices) {
        expect(c.length, `${q.id} choice "${c}"`).toBeLessThanOrEqual(MAX_CHOICE);
      }
      if (q.note) expect(q.note.length, `${q.id} note`).toBeLessThanOrEqual(MAX_NOTE);
    }
  });

  it('has no duplicate question stems', () => {
    const seen = new Map<string, string>();
    for (const q of pool) {
      expect(seen.get(q.question), `${q.id} duplicates ${seen.get(q.question)}`).toBeUndefined();
      seen.set(q.question, q.id);
    }
  });
});

// 형제 문항 계보(TRIVIA_GROUPS_BY_ID) 게이트. 오타 난 id는 조용히 무시되므로 — 그러면
// 누출을 막는 줄 알았던 묶음이 실제로는 아무 일도 안 한다 — 테스트로 잡는다.
describe('trivia sibling families', () => {
  it('only references ids that exist in the pool', () => {
    const ids = new Set(TRIVIA_POOL.map((q) => q.id));
    for (const id of TRIVIA_GROUPS_BY_ID.keys()) {
      expect(ids.has(id), `family table references unknown id "${id}"`).toBe(true);
    }
  });

  it('tags the sorted pool the picker actually reads', () => {
    const tagged = TRIVIA_POOL_SORTED.filter((q) => q.exclusiveGroups?.length);
    expect(tagged.length).toBe(TRIVIA_GROUPS_BY_ID.size);
  });

  it('never puts two siblings in the same round', () => {
    for (let seed = 0; seed < 400; seed++) {
      const seen = new Map<string, string>();
      for (const q of buildQuizPlan(seed, TRIVIA_POOL_SORTED).questions) {
        for (const g of TRIVIA_GROUPS_BY_ID.get(q.id) ?? []) {
          expect(
            seen.get(g),
            `seed ${seed}: ${q.id} and ${seen.get(g)} are both in family "${g}"`,
          ).toBeUndefined();
          seen.set(g, q.id);
        }
      }
    }
  });

  it('gives every real round the same 2/2/1 difficulty mix', () => {
    const levelOf = new Map(TRIVIA_POOL.map((q) => [q.id, q.difficulty]));
    for (let seed = 0; seed < 400; seed++) {
      const levels = buildQuizPlan(seed, TRIVIA_POOL_SORTED).questions.map(
        (q) => levelOf.get(q.id)!,
      );
      const count = (d: number) => levels.filter((x) => x === d).length;
      expect([count(1), count(2), count(3)], `seed ${seed}`).toEqual([2, 2, 1]);
    }
  });

  // 200 rounds, not 20. The old 20-round version passed while the bag was broken:
  // the hard tier (54 questions, exactly one slot per round) empties at round 54,
  // and a whole-pool refresh check didn't fire until round 71 — so rounds 54-70
  // each re-served a hard question the room had already seen. Any bound below ~54
  // never reaches the tier that actually binds. 200 clears every tier's cycle
  // (hard ~53, easy ~74, normal ~78) several times over.
  it('serves a party 200 straight rounds with no repeat and no broken mix', () => {
    // Mirrors rounds/quiz.ts exactly: refresh the bag, snapshot, build, append.
    const levelOf = new Map(TRIVIA_POOL.map((q) => [q.id, q.difficulty]));
    for (const room of [0, 1, 2, 3, 4]) {
      let served: string[] = [];
      for (let r = 0; r < 200; r++) {
        const snapshot = refreshServedBag(TRIVIA_POOL_SORTED, served, 5, 4);
        const qs = buildQuizPlan(room * 1009 + r * 7919, TRIVIA_POOL_SORTED, snapshot).questions;
        expect(qs.length, `room ${room} round ${r}`).toBe(5);
        for (const q of qs) {
          expect(snapshot, `room ${room} round ${r} repeated ${q.id}`).not.toContain(q.id);
        }
        // Freshness must not come at the cost of the difficulty mix — the picker
        // drops freshness *before* the quota, so a starved tier shows up here
        // as a repeat rather than as a skew. Both are asserted.
        const levels = qs.map((q) => levelOf.get(q.id)!);
        const count = (d: number) => levels.filter((x) => x === d).length;
        expect([count(1), count(2), count(3)], `room ${room} round ${r}`).toEqual([2, 2, 1]);
        served = [...snapshot, ...qs.map((q) => q.id)];
      }
    }
  });

  it('never repeats a correct answer within a round', () => {
    const answerOf = new Map(TRIVIA_POOL.map((q) => [q.id, q.choices[q.correctIndex]]));
    for (let seed = 0; seed < 400; seed++) {
      const seen = new Map<string, string>();
      for (const q of buildQuizPlan(seed, TRIVIA_POOL_SORTED).questions) {
        const answer = answerOf.get(q.id)!;
        if (/^[0-9]/.test(answer)) continue; // 개수·연도 우연 일치는 누출이 아님
        expect(
          seen.get(answer),
          `seed ${seed}: ${q.id} and ${seen.get(answer)} share the answer "${answer}"`,
        ).toBeUndefined();
        seen.set(answer, q.id);
      }
    }
  });
});

// 넌센스 전용 게이트(questions.ts 헤더의 입고 게이트 5번): 같은 정답이 두 문항에 있으면
// 같은 농담의 재탕이다(예: 과일 '배'가 두 번). trivia는 사실 기반이라 정답 중복(파리,
// 이집트 등)이 정상이므로 여기서만 검사한다. 숫자로 시작하는 답('3개', '9명')은 개수
// 문항끼리의 우연한 충돌이라 제외.
// 넌센스 형제 문항 계보 — trivia와 동일 게이트. 넌센스 풀은 buildQuizPlan을 실제로
// 돌려보는 테스트가 없어서 태그가 죽어도(오타·부착 누락) 잡을 수 없었다.
describe('nonsense sibling families', () => {
  it('only references ids that exist in the pool', () => {
    const ids = new Set(NONSENSE_POOL.map((q) => q.id));
    for (const id of NONSENSE_GROUPS_BY_ID.keys()) {
      expect(ids.has(id), `family table references unknown id "${id}"`).toBe(true);
    }
  });

  it('tags the sorted pool the picker actually reads', () => {
    const tagged = NONSENSE_POOL_SORTED.filter((q) => q.exclusiveGroups?.length);
    expect(tagged.length).toBe(NONSENSE_GROUPS_BY_ID.size);
  });

  it('never puts two siblings in the same round', () => {
    for (let seed = 0; seed < 400; seed++) {
      const seen = new Map<string, string>();
      for (const q of buildQuizPlan(seed, NONSENSE_POOL_SORTED).questions) {
        for (const g of NONSENSE_GROUPS_BY_ID.get(q.id) ?? []) {
          expect(
            seen.get(g),
            `seed ${seed}: ${q.id} and ${seen.get(g)} are both in family "${g}"`,
          ).toBeUndefined();
          seen.set(g, q.id);
        }
      }
    }
  });

  // trivia에는 있고 nonsense엔 없던 게이트. 형제 배제가 붙으면 "미출제 5개 남음"이
  // "5개 다 쓸 수 있음"을 더는 뜻하지 않아서, 셔플백 경계 라운드에서 이미 낸 문항이
  // 다시 나왔다(실제로 재현된 회귀). 소진 직전까지 돌려서 그 경계를 지난다.
  it('serves a party many rounds without repeating or breaking sibling exclusion', () => {
    for (const room of [0, 1, 2]) {
      let served: string[] = [];
      for (let r = 0; r < 120; r++) {
        // rounds/quiz.ts와 같은 함수. 넌센스는 난이도 태그가 없어 티어별 리프레시가
        // 꺼지고 전체 소진 검사만 남는다 — 그 축퇴가 유지되는지도 여기서 지켜진다.
        const snapshot = refreshServedBag(NONSENSE_POOL_SORTED, served, 5, 4);
        const qs = buildQuizPlan(room * 1009 + r * 7919, NONSENSE_POOL_SORTED, snapshot).questions;
        expect(qs.length, `room ${room} round ${r}`).toBe(5);
        const seen = new Map<string, string>();
        for (const q of qs) {
          expect(snapshot, `room ${room} round ${r} repeated ${q.id}`).not.toContain(q.id);
          for (const g of NONSENSE_GROUPS_BY_ID.get(q.id) ?? []) {
            expect(seen.get(g), `room ${room} round ${r}: family "${g}" twice`).toBeUndefined();
            seen.set(g, q.id);
          }
        }
        served = [...snapshot, ...qs.map((q) => q.id)];
      }
    }
  });
});

// 셔플백 리프레시 단위 테스트. 위 파티 테스트가 최종 증거지만 200라운드를 돌려야
// 실패가 보이므로, 경계 자체를 직접 못 박아 둔다.
describe('shuffle-bag refresh', () => {
  const idsOf = (level: 1 | 2 | 3) =>
    TRIVIA_POOL.filter((q) => q.difficulty === level).map((q) => q.id);

  it('keeps the served list untouched while every tier has room', () => {
    const served = [...idsOf(1).slice(0, 10), ...idsOf(3).slice(0, 10)];
    expect(refreshServedBag(TRIVIA_POOL_SORTED, served, 5, 4)).toEqual(served);
  });

  it('drops only the exhausted tier, not the whole history', () => {
    // Hard tier drained; easy/normal barely touched.
    const easySeen = idsOf(1).slice(0, 12);
    const served = [...idsOf(3), ...easySeen];
    const refreshed = refreshServedBag(TRIVIA_POOL_SORTED, served, 5, 4);
    expect(refreshed).toEqual(easySeen);
  });

  it('fires before the picker is forced to repeat a hard question', () => {
    // Hard quota is 1/round, so the tier must refresh while at least one unseen
    // hard question is still available — never after it has run out.
    const hard = idsOf(3);
    const quota = difficultyQuota(5)[3];
    for (let seen = 0; seen <= hard.length; seen++) {
      const served = hard.slice(0, seen);
      const refreshed = refreshServedBag(TRIVIA_POOL_SORTED, served, 5, 4);
      const unseenHard = hard.length - refreshed.filter((id) => hard.includes(id)).length;
      expect(unseenHard, `after ${seen} hard questions served`).toBeGreaterThanOrEqual(quota);
    }
  });

  it('wipes everything when the pool as a whole is spent', () => {
    const all = TRIVIA_POOL.map((q) => q.id);
    expect(refreshServedBag(TRIVIA_POOL_SORTED, all, 5, 4)).toEqual([]);
  });

  it('leaves an untagged pool on the original whole-pool rule', () => {
    const all = NONSENSE_POOL.map((q) => q.id);
    const most = all.slice(0, all.length - 20);
    // Plenty left → untouched. Nothing left → wiped. No tier behaviour in between.
    expect(refreshServedBag(NONSENSE_POOL_SORTED, most, 5, 4)).toEqual(most);
    expect(refreshServedBag(NONSENSE_POOL_SORTED, all, 5, 4)).toEqual([]);
  });

  it('keeps ids that are no longer in the pool as seen', () => {
    // A retired question must not silently come back as "unseen" for that room.
    const served = [...idsOf(1).slice(0, 5), 'retired-question-id'];
    expect(refreshServedBag(TRIVIA_POOL_SORTED, served, 5, 4)).toContain('retired-question-id');
  });
});

describe('nonsense answer uniqueness', () => {
  it('never reuses a (non-numeric) correct answer across questions', () => {
    const seen = new Map<string, string>();
    for (const q of NONSENSE_POOL) {
      const answer = q.choices[q.correctIndex];
      if (/^[0-9]/.test(answer)) continue;
      expect(seen.get(answer), `${q.id} reuses answer "${answer}" of ${seen.get(answer)}`).toBeUndefined();
      seen.set(answer, q.id);
    }
  });
});
