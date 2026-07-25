import type { Metadata } from 'next';
import Link from 'next/link';
import { ko } from '@/lib/i18n';
import { GATE, gateStatus, getTrafficStats } from '@/server/stats';
import { Logo } from '@/components/Logo';
import { SiteFooter } from '@/components/SiteFooter';

// 운영자용 트래픽 대시보드. 공개 페이지지만 색인 제외(robots.ts disallow + noindex)이고
// 어디에도 링크하지 않는다 — 지표 자체는 오픈소스 프로젝트라 비밀 아님.
// Prometheus 조회는 서버에서만(토큰은 fly secret), 10분 캐시(src/server/stats.ts).

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${ko.stats.title} · ${ko.app.title}`,
  robots: { index: false, follow: false },
};

export default async function StatsPage() {
  const stats = await getTrafficStats();

  return (
    <main className="min-h-dvh flex flex-col px-6">
      <article className="flex-1 mx-auto w-full max-w-sm py-10">
        <Link href="/" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          ← {ko.legal.backHome}
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <Logo size={34} />
          <h1 className="text-2xl font-bold">{ko.stats.title}</h1>
        </div>

        {!stats ? (
          <p className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
            {process.env.FLY_PROMETHEUS_TOKEN ? ko.stats.fetchFailed : ko.stats.noToken}
          </p>
        ) : (
          <StatsBody stats={stats} />
        )}
      </article>
      <SiteFooter />
    </main>
  );
}

function StatsBody({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof getTrafficStats>>>;
}) {
  const { weeklyRooms, roundsByGame, fetchedAt } = stats;
  const { streak, stage } = gateStatus(weeklyRooms);
  const thisWeek = weeklyRooms[0];
  const pct = Math.min(100, Math.round((thisWeek / GATE.stage2Weekly) * 100));
  const maxWeek = Math.max(...weeklyRooms, GATE.stage2Weekly);
  const games = Object.entries(roundsByGame).sort(([, a], [, b]) => b - a);
  const updated = new Date(fetchedAt).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });

  return (
    <>
      {/* 이번 주 + 게이트 진행률 */}
      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {ko.stats.thisWeek}
          </h2>
          <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">
            {ko.stats.stageBadge(stage)}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-5xl font-black tabular-nums text-zinc-50">{thisWeek}</span>
          <span className="text-sm text-zinc-500">{ko.stats.gateLabel(GATE.stage2Weekly)}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
          <span>{ko.stats.gatePercent(pct)}</span>
          <span>{ko.stats.streak(streak, GATE.stage2Streak)}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">{ko.stats.stageDesc[stage]}</p>
      </section>

      {/* 최근 4주 추이 */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <ul className="space-y-2.5">
          {weeklyRooms.map((n, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-14 flex-none text-right text-xs text-zinc-500">
                {i === 0 ? ko.stats.thisWeek : ko.stats.weekAgo(i)}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full rounded bg-zinc-600"
                  style={{ width: `${Math.round((n / maxWeek) * 100)}%` }}
                />
              </div>
              <span className="w-8 flex-none text-right text-sm font-bold tabular-nums text-zinc-200">
                {n}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 게임별 라운드 */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {ko.stats.roundsTitle}
        </h2>
        {games.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">{ko.stats.roundsEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {games.map(([game, n]) => (
              <li key={game} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">
                  {(ko.games as Record<string, unknown>)[game] as string ?? game}
                </span>
                <span className="font-bold tabular-nums text-zinc-200">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-center text-xs text-zinc-600">{ko.stats.updatedAt(updated)}</p>
    </>
  );
}
