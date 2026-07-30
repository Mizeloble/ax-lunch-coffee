import { GAME_META, gameCategory, type GameId } from '@/games/types';
import { ko } from '@/lib/i18n';

// 게임 카드/칩의 한 줄 부제(소요시간 + 조작/성격). 로비 GamePicker와 랜딩 라인업이
// 같은 라벨을 쓰도록 한 곳에 모은다 — 분기 로직이 두 군데로 갈라지지 않게.
export function gameSubLabel(id: GameId): string {
  const m = GAME_META[id];
  const s = m.estimatedSeconds;
  if (id === 'trivia') return ko.games.triviaEstimate(s);
  if (id === 'nonsense') return ko.games.nonsenseEstimate(s);
  if (id === 'marble-tilt') return ko.games.tiltEstimate(s);
  if (m.needsClientInput) return ko.games.reactionEstimate(s);
  if (m.needsPreCharge) return ko.games.cheerEstimate(s);
  return ko.games.physicsEstimate(s);
}

// 좁은 2열 타일/칩용 짧은 부제("35초 · 운빨 100%"). gameSubLabel과 같은 분기를 쓰되
// "~"와 장르 설명을 빼고 승부를 가르는 요소 한 낱말만 남긴다.
export function gameShortLabel(id: GameId): string {
  const m = GAME_META[id];
  const s = m.estimatedSeconds;
  if (id === 'trivia') return ko.games.triviaShort(s);
  if (id === 'nonsense') return ko.games.nonsenseShort(s);
  if (id === 'marble-tilt') return ko.games.tiltShort(s);
  if (m.needsClientInput) return ko.games.reactionShort(s);
  if (m.needsPreCharge) return ko.games.cheerShort(s);
  return ko.games.marbleShort(s);
}

/** GAME_META.category를 사용자 언어로 — 필터 칩과 타일 부제가 같은 낱말을 쓴다. */
export function gameCategoryLabel(id: GameId): string {
  return ko.gameCategories[gameCategory(id)];
}
