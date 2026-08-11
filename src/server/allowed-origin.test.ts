import { describe, expect, it } from 'vitest';
import { parseAllowedOrigin } from './allowed-origin';

describe('parseAllowedOrigin', () => {
  it('미설정/빈 값 → false (기존 프로덕션 기본값 유지)', () => {
    expect(parseAllowedOrigin(undefined)).toBe(false);
    expect(parseAllowedOrigin('')).toBe(false);
    expect(parseAllowedOrigin('  ')).toBe(false);
    expect(parseAllowedOrigin(',')).toBe(false);
  });

  it('단일 값은 문자열 그대로 (현재 fly secret과 동일 동작)', () => {
    expect(parseAllowedOrigin('https://bokbulbok-party.fly.dev')).toBe(
      'https://bokbulbok-party.fly.dev',
    );
  });

  it('콤마 분리 → 배열', () => {
    expect(
      parseAllowedOrigin(
        'https://bokbulbok-party.fly.dev,https://bokbulbok.web.tossmini.com,https://bokbulbok.private-web.tossmini.com',
      ),
    ).toEqual([
      'https://bokbulbok-party.fly.dev',
      'https://bokbulbok.web.tossmini.com',
      'https://bokbulbok.private-web.tossmini.com',
    ]);
  });

  it('공백·빈 세그먼트(후행 콤마, 이중 콤마)는 무시', () => {
    expect(parseAllowedOrigin(' https://a.example , ,https://b.example, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});
