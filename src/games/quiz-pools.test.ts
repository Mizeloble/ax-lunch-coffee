import { describe, it, expect } from 'vitest';
import { TRIVIA_POOL, TRIVIA_GROUPS_BY_ID, TRIVIA_POOL_SORTED } from './trivia/questions';
import { NONSENSE_POOL } from './nonsense/questions';
import { buildQuizPlan } from './trivia/server';

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

  it('serves a party 20 straight rounds with no repeated question', () => {
    // Mirrors rounds/quiz.ts: snapshot the served list, build, then append.
    const levelOf = new Map(TRIVIA_POOL.map((q) => [q.id, q.difficulty]));
    for (const room of [0, 1, 2, 3, 4]) {
      const served: string[] = [];
      for (let r = 0; r < 20; r++) {
        const qs = buildQuizPlan(room * 1009 + r * 7919, TRIVIA_POOL_SORTED, served).questions;
        for (const q of qs) {
          expect(served, `room ${room} round ${r} repeated ${q.id}`).not.toContain(q.id);
        }
        // Freshness must not come at the cost of the difficulty mix.
        const levels = qs.map((q) => levelOf.get(q.id)!);
        const count = (d: number) => levels.filter((x) => x === d).length;
        expect([count(1), count(2), count(3)], `room ${room} round ${r}`).toEqual([2, 2, 1]);
        served.push(...qs.map((q) => q.id));
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
