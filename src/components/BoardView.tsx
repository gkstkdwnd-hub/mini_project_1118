import React, { useEffect, useState } from 'react';
import { ArrowDown, Lightbulb, RefreshCw } from 'lucide-react';
import { GenerationMixCard } from './GenerationMixCard';
import { useLiveDemand } from '../hooks/useLiveDemand';

interface Live {
  currentDemand: number | null;
  supplyCapacity: number | null;
  forecastPeak: number | null;
  supplyReserve: number | null;
  supplyReserveRate: number | null;
  baseDatetime: string | null;
}

type Level = 'green' | 'yellow' | 'red';

interface Signal {
  level: Level;
  title: string;
  text: string;
}

// 참고용 구분이다. 공식 전력수급 경보와는 다르다.
// 5,500MW는 2022년 보도된 경보 ‘준비’ 단계(공급예비력 5.5GW 미만)를 참고한 값이고, 10,000MW는 이 앱이 정한 여유 구간이다.
const RED_BELOW_MW = 5500;
const YELLOW_BELOW_MW = 10000;

function signalFrom(supplyReserve: number | null): Signal | null {
  if (supplyReserve === null) return null;
  if (supplyReserve >= YELLOW_BELOW_MW) {
    return { level: 'green', title: '여유 있어요', text: '지금 남는 전기가 충분해요. 마음 놓고 써도 괜찮아요.' };
  }
  if (supplyReserve >= RED_BELOW_MW) {
    return { level: 'yellow', title: '여유가 줄었어요', text: '아직은 괜찮지만 남는 전기가 줄고 있어요. 안 쓰는 전기는 꺼 주세요.' };
  }
  return { level: 'red', title: '빠듯해요', text: '남는 전기가 많이 줄었어요. 큰 가전은 잠시 미뤄 주세요.' };
}

const LEVEL_STYLE: Record<Level, { dot: string; chip: string }> = {
  green: { dot: 'bg-emerald-400', chip: 'bg-emerald-400/20 text-emerald-50 border-emerald-300/40' },
  yellow: { dot: 'bg-amber-300', chip: 'bg-amber-300/20 text-amber-50 border-amber-200/40' },
  red: { dot: 'bg-rose-400', chip: 'bg-rose-400/25 text-rose-50 border-rose-300/40' },
};

function currentKstHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  return Number(h) || 0;
}

function scrollToChapter(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

const TIPS: Array<{ title: string; text: string }> = [
  { title: '안 쓰는 플러그는 빼 두기', text: '꺼진 것처럼 보여도 꽂혀만 있으면 전기가 새요. 멀티탭 스위치를 꺼 두면 한 번에 막을 수 있어요.' },
  { title: '냉난방은 온도를 조금만 조절', text: '설정 온도를 1~2도만 조절해도 전기 사용량이 눈에 띄게 달라져요.' },
  { title: '큰 가전은 시간을 나눠서', text: '건조기·전기히터처럼 전기를 많이 먹는 가전을 한꺼번에 켜지 말고 시간을 나눠 써 보세요.' },
];

function ChapterHeader({ num, kicker, title }: { num: number; kicker: string; title: string }) {
  return (
    <header className="flex items-center gap-3">
      <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-teal-700 text-white font-bold text-lg font-mono-num shadow-sm shrink-0">
        {num}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide text-teal-700">{kicker}</p>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug break-keep">{title}</h2>
      </div>
    </header>
  );
}

function Connector({ text, target }: { text: string; target: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToChapter(target)}
      className="group w-full flex flex-col items-start gap-1 text-left cursor-pointer"
    >
      <span className="text-sm font-semibold text-teal-800 group-hover:underline break-keep">{text}</span>
      <ArrowDown className="w-4 h-4 text-teal-600 animate-bounce motion-reduce:animate-none" />
    </button>
  );
}

export const BoardView: React.FC = () => {
  // 실시간 수급: 1분마다 서버에 물어본다. 전력거래소 값이 새로 나오면(5분 간격) 곧바로 화면에 반영된다.
  const { live, failed: liveFailed, loading: liveLoading, notice, refresh } = useLiveDemand(60 * 1000);

  // "N분 전 확인"과 "지금 N시"가 시간이 지나도 맞도록 30초마다 다시 그린다.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const nowHour = currentKstHour();

  const baseLabel = live?.baseDatetime
    ? new Date(live.baseDatetime).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;
  const agoMin = live?.fetchedAt ? Math.max(0, Math.floor((tick - new Date(live.fetchedAt).getTime()) / 60000)) : null;
  const agoLabel = agoMin === null ? null : agoMin < 1 ? '방금 확인' : `${agoMin}분 전 확인`;

  const signal = signalFrom(live?.supplyReserve ?? null);
  const pctOfForecast =
    live?.currentDemand && live.forecastPeak ? Math.round((live.currentDemand / live.forecastPeak) * 100) : null;
  // 대형 원전 1기를 1,000MW로 어림한 비유다 (실제 설비용량은 호기마다 다름).
  const reactorEq = live?.currentDemand ? Math.round(live.currentDemand / 1000) : null;

  const headroom =
    live?.supplyCapacity && live.forecastPeak ? live.supplyCapacity - live.forecastPeak : null;
  const headroomPct = headroom !== null && live?.forecastPeak ? (headroom / live.forecastPeak) * 100 : null;
  const riseLeft = live?.currentDemand && live.forecastPeak ? live.forecastPeak - live.currentDemand : null;

  const toPct = (v: number | null | undefined) =>
    live?.supplyCapacity && v ? Math.min(100, Math.max(0, (v / live.supplyCapacity) * 100)) : 0;

  const c12 =
    signal?.level === 'green'
      ? '지금은 여유가 있어요. 그런데 오늘 가장 바쁜 순간에도 괜찮을까요?'
      : signal
      ? '여유가 줄었어요. 오늘 가장 바쁜 순간엔 어떨까요?'
      : '오늘 하루는 어떻게 흘러갈까요?';

  return (
    <div className="space-y-8 py-2 max-w-3xl mx-auto">
      <nav aria-label="이야기 목차" className="flex flex-wrap gap-1.5">
        {[
          ['ch1', '1 지금'],
          ['ch2', '2 오늘'],
          ['ch3', '3 발전원'],
          ['ch4', '4 우리 집'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToChapter(id)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:border-teal-600 hover:text-teal-700 cursor-pointer"
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 1막: 지금 */}
      <section id="ch1" className="scroll-mt-24 space-y-4">
        <ChapterHeader num={1} kicker="1막 · 지금" title="지금, 우리나라 전기는 여유가 있을까?" />

        <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 text-white p-5 shadow-sm overflow-hidden relative">
          <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-amber-300/20 blur-2xl" aria-hidden="true" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-100">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-rose-300 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-400" />
                </span>
                지금 {nowHour}시, 우리나라가 쓰는 전기
              </p>
              {signal && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${LEVEL_STYLE[signal.level].chip}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_STYLE[signal.level].dot}`} />
                  {signal.title}
                </span>
              )}
            </div>

            {live?.currentDemand ? (
              <>
                <p
                  key={live.baseDatetime ?? 'live'}
                  className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight font-mono-num animate-fade-in"
                >
                  {fmt(live.currentDemand)}
                  <span className="ml-1 text-lg font-semibold text-teal-100">MW</span>
                </p>
                <p className="mt-3 text-sm text-teal-50 leading-relaxed">
                  {reactorEq !== null && <>대형 원전 약 {reactorEq}기가 내는 전기와 맞먹어요. </>}
                </p>

                <div className="mt-3 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-[11px] text-teal-100 font-mono-num">
                    {baseLabel && <>{baseLabel} 기준</>}
                    {agoLabel && <> · {agoLabel}</>}
                    <span className="font-sans text-teal-200/80"> · 1분마다 자동 확인</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={liveLoading}
                    aria-busy={liveLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                    새로고침
                  </button>
                </div>

                {notice && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={`mt-2 px-3 py-2 rounded-xl border text-xs font-medium ${
                      notice.tone === 'ok'
                        ? 'bg-emerald-400/20 border-emerald-300/40 text-emerald-50'
                        : notice.tone === 'warn'
                        ? 'bg-amber-300/20 border-amber-200/40 text-amber-50'
                        : 'bg-white/10 border-white/20 text-teal-50'
                    }`}
                  >
                    {notice.text}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-teal-200/90">
                  한국전력거래소 실시간 값(5분 간격) · 원전 1기는 1,000MW로 어림한 비유예요
                </p>
              </>
            ) : liveFailed ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-teal-50">지금 전력 수급을 불러오지 못했어요. 아래 내용은 그대로 볼 수 있어요.</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={liveLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
                  다시 불러오기
                </button>
              </div>
            ) : (
              <div className="mt-2 h-14 w-48 rounded-xl bg-white/15 animate-pulse" aria-hidden="true" />
            )}
          </div>
        </div>

        {signal && live?.supplyReserve != null && (
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1.5">
            <p className="text-sm text-slate-800 leading-relaxed">
              <b>{signal.title}.</b> {signal.text}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed font-mono-num">
              지금 남는 전기(공급예비력) {fmt(live.supplyReserve)} MW
              {live.supplyReserveRate != null && <> · 예비율 {live.supplyReserveRate.toFixed(0)}%</>}
            </p>
            <p className="text-[11px] text-slate-400 leading-snug">
              초록·노랑·빨강은 이 앱의 참고용 구분이에요. 빨강 기준(5,500MW)은 2022년에 보도된 전력수급 경보 ‘준비’ 단계
              기준을 참고했고, 공식 경보는 한국전력거래소 공지를 확인하세요.
            </p>
          </div>
        )}

        <Connector text={c12} target="ch2" />
      </section>

      {/* 2막: 오늘 */}
      <section id="ch2" className="scroll-mt-24 space-y-4">
        <ChapterHeader num={2} kicker="2막 · 오늘" title="오늘 가장 바쁜 순간에도 괜찮을까?" />

        {live?.currentDemand && live.supplyCapacity && live.forecastPeak ? (
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div>
              <div className="relative h-4 rounded-full bg-slate-100 overflow-visible">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-teal-600 transition-all"
                  style={{ width: `${toPct(live.currentDemand)}%` }}
                />
                <div
                  className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-amber-500"
                  style={{ left: `${toPct(live.forecastPeak)}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-slate-500">지금</p>
                  <p className="text-sm font-bold text-teal-800 font-mono-num">{fmt(live.currentDemand)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-amber-700">오늘 예상 최고</p>
                  <p className="text-sm font-bold text-amber-800 font-mono-num">{fmt(live.forecastPeak)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">공급능력</p>
                  <p className="text-sm font-bold text-slate-800 font-mono-num">{fmt(live.supplyCapacity)}</p>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 text-right">단위: MW</p>
            </div>

            <div className="space-y-2 text-sm text-slate-800 leading-relaxed">
              {pctOfForecast !== null && (
                <p>
                  지금은 오늘 예상 최고치의 <b className="text-teal-800">{pctOfForecast}%</b>예요.{' '}
                  {riseLeft !== null &&
                    (riseLeft > 0 ? (
                      <>앞으로 {fmt(riseLeft)} MW쯤 더 늘 수 있어요.</>
                    ) : (
                      <>이미 예상 최고치를 넘어섰어요.</>
                    ))}
                </p>
              )}
              {headroom !== null && headroomPct !== null && (
                <p>
                  {headroom >= 0 ? (
                    <>
                      가장 바쁜 순간이 와도 <b className="text-teal-800">{fmt(headroom)} MW</b>(예상 최고치의 약{' '}
                      {headroomPct.toFixed(0)}%)가 남는 계산이에요.
                    </>
                  ) : (
                    <>예상 최고치가 지금 공급능력보다 커요. 오늘은 수급 상황을 눈여겨봐야 해요.</>
                  )}
                </p>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              ‘남는 계산’은 공급능력에서 예상 최고치를 뺀 값이에요. 예상은 말 그대로 예측이라 실제와 다를 수 있어요.
            </p>
          </div>
        ) : (
          <p className="p-4 rounded-2xl bg-white border border-slate-200 text-sm text-slate-600">
            {liveFailed ? '실시간 수급을 불러오지 못해 오늘의 흐름을 보여 드리기 어려워요.' : '오늘의 흐름을 불러오는 중이에요…'}
          </p>
        )}

        <Connector text="여유는 확인했어요. 그럼 이 전기는 지금 무엇으로 만들고 있을까요?" target="ch3" />
      </section>

      {/* 3막: 발전원 */}
      <section id="ch3" className="scroll-mt-24 space-y-4">
        <ChapterHeader num={3} kicker="3막 · 발전원" title="지금 우리나라 전기는 무엇으로 만들고 있을까?" />
        <p className="text-sm text-slate-700 leading-relaxed">
          전기는 한 가지로만 만들지 않아요. 원자력, 석탄, 가스, 신재생(태양광·풍력 등)이 각자 몫을 나눠 맡고, 그 비율은 시간에 따라
          달라져요. ‘지금’은 5분마다 갱신돼요. 확정된 지난 하루는 시간대별로도 볼 수 있어요.
        </p>
        <GenerationMixCard />
        <Connector text="전기가 어디서 오는지 알았어요. 그럼 우리 집 전기는 어디에 쓰일까요?" target="ch4" />
      </section>

      {/* 4막: 우리 집 */}
      <section id="ch4" className="scroll-mt-24 space-y-4">
        <ChapterHeader num={4} kicker="4막 · 우리 집" title="그럼 우리 집 전기는 어디에 쓰일까?" />

        <div className="rounded-2xl bg-amber-50/70 border border-amber-200 shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/70">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-sm text-slate-900">오늘부터 할 수 있는 작은 습관</h3>
          </div>
          <ul className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIPS.map((t) => (
              <li key={t.title} className="p-3 rounded-xl bg-white border border-amber-100">
                <p className="text-sm font-bold text-slate-900 break-keep">{t.title}</p>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>

      </section>
    </div>
  );
};
