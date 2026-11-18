import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Lightbulb,
  Loader2,
  MessageCircle,
  Newspaper,
  Sparkles,
  Sun,
  Upload,
  Zap,
} from 'lucide-react';
import { AnalysisResult, computeSeasonalComparison } from '../utils/kpxParser';
import { DuckCurveIllustration } from './DuckCurveIllustration';

interface AiProps {
  text: string | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}

interface StoryViewProps {
  analysis: AnalysisResult | null;
  /** 3막에서 ‘그래프로 자세히 보기’를 펼치면 보여 줄 봄·가을 비교 화면 */
  seasonalDetail: React.ReactNode;
  /** 4막의 실제 사례 모음 */
  realCases: React.ReactNode;
  ai: AiProps;
  onGoToData: () => void;
  onGoToNews: () => void;
}

interface Live {
  currentDemand: number | null;
  forecastPeak: number | null;
  baseDatetime: string | null;
}

type Stage = 'demand' | 'duck';
type Act = 'ch1' | 'ch2' | 'ch3';

function currentKstHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return Number(h) || 0;
}

function scrollToChapter(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface HourStory {
  title: string;
  text: string;
}

// 태양광 이야기를 하기 전, 사람들이 쓰는 전기만 본다.
function demandStory(hour: number): HourStory {
  if (hour <= 5 || hour === 24) {
    return { title: '한밤중', text: '다들 잠든 시간이라 전기를 가장 적게 써요.' };
  }
  if (hour <= 8) {
    return { title: '아침', text: '일어나서 불을 켜고 출근 준비를 하면서 전기 사용이 올라가요.' };
  }
  if (hour <= 17) {
    return { title: '낮', text: '공장과 사무실, 가게가 돌아가면서 전기를 많이 써요.' };
  }
  if (hour <= 21) {
    return { title: '저녁', text: '퇴근해서 집에서 조명과 TV, 밥솥을 쓰는 시간이에요. 낮의 사용량에 집 안 전기가 더해져요.' };
  }
  return { title: '밤', text: '사용량이 서서히 내려가면서 하루가 끝나가요.' };
}

// 태양광이 만든 전기를 뺀 ‘다른 발전소가 채울 몫’을 본다.
function duckStory(hour: number): HourStory {
  if (hour <= 5 || hour === 24) {
    return { title: '한밤중', text: '태양광이 쉬는 시간이라 발전소들이 수요를 그대로 채워요. 오리의 등 쪽이에요.' };
  }
  if (hour <= 8) {
    return { title: '아침', text: '해가 뜨며 태양광이 시작돼서, 발전소가 채울 몫이 조금씩 줄어들기 시작해요.' };
  }
  if (hour <= 15) {
    return {
      title: '한낮 · 오리의 배',
      text: '태양광이 전기를 잔뜩 만들어 줘서 다른 발전소가 채울 몫이 푹 줄어요. 오리 배처럼 움푹 들어가죠. 에어컨·난방이 적은 봄·가을엔 더 깊어져요.',
    };
  }
  if (hour <= 17) {
    return { title: '오후', text: '해가 기울면서 태양광이 줄기 시작해요. 움푹했던 곡선이 슬슬 올라와요.' };
  }
  if (hour <= 21) {
    return {
      title: '저녁 · 오리의 목과 머리',
      text: '해는 졌는데 퇴근해서 전기를 쓰는 시간이에요. 태양광은 빠지고 수요는 오르니, 다른 발전소가 짧은 시간에 확 늘려야 해요. 덕 커브에서 가장 힘든 구간이에요.',
    };
  }
  return { title: '밤', text: '수요가 내려가면서 발전소의 부담도 줄어들어요.' };
}

const GLOSSARY: Array<{ term: string; def: string }> = [
  { term: '덕 커브', def: '하루 동안 ‘다른 발전소가 채워야 할 전기’를 그래프로 그리면 오리 옆모습처럼 보여서 붙은 이름이에요.' },
  { term: '순부하', def: '전체 전기 수요에서 태양광이 만든 전기를 뺀 값이에요. 석탄·가스·원전 같은 다른 발전소가 책임질 몫이에요.' },
  { term: '경부하기', def: '전기를 적게 쓰는 시기예요. 냉난방이 적은 봄·가을이 대표적이에요.' },
  { term: '출력제어', def: '전기가 남을 때 발전소가 만드는 전기를 일부러 줄이는 일이에요.' },
  { term: 'MW와 MWh', def: 'MW는 ‘지금 얼마나 쓰는지’, MWh는 ‘한 시간 동안 쓴 양’이에요. 1시간 기준으로는 숫자가 같아서 서로 비교할 수 있어요.' },
];

const TIPS: Array<{ title: string; text: string }> = [
  { title: '큰 가전은 저녁을 피해서', text: '세탁기·건조기·식기세척기는 가능하면 낮이나 늦은 밤에 돌려 보세요. 오리의 머리가 조금 낮아져요.' },
  { title: '전기차는 낮이나 한밤에 충전', text: '태양광이 남는 낮이나 수요가 적은 한밤에 충전하면 저녁 정점과 겹치지 않아요.' },
  { title: '저녁 6~9시에는 안 쓰는 전기 끄기', text: '쓰지 않는 조명과 멀티탭을 꺼 두는 작은 습관이 가장 바쁜 시간대의 부담을 덜어요.' },
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

export const StoryView: React.FC<StoryViewProps> = ({
  analysis,
  seasonalDetail,
  realCases,
  ai,
  onGoToData,
  onGoToNews,
}) => {
  const [live, setLive] = useState<Live | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  const nowHour = useMemo(() => currentKstHour(), []);
  const [hour, setHour] = useState<number>(nowHour);
  const [stage, setStage] = useState<Stage>('demand');
  const [active, setActive] = useState<Act>('ch1');

  // 실시간 수요: 5분마다 확인한다. 서버가 15분 동안 값을 저장해 두므로 호출 한도는 안전하다.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/live-demand');
        const body = (await res.json().catch(() => null)) as (Live & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body || body.error || body.currentDemand === null) throw new Error('live');
        setLive(body);
        setLiveFailed(false);
      } catch {
        if (!cancelled) setLiveFailed(true);
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // 화면 중앙에 오는 막을 따라 고정된 그림이 바뀐다: 1·2막은 사용량 곡선, 3막에서 태양광을 켜서 오리가 된다.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = (['ch1', 'ch2', 'ch3'] as const)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id as Act);
        }
      },
      { rootMargin: '-50% 0px -45% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (active === 'ch1') {
      setStage('demand');
      setHour(nowHour);
    } else if (active === 'ch2') {
      setStage('demand');
    } else {
      setStage('duck');
    }
  }, [active, nowHour]);

  const pctOfForecast =
    live?.currentDemand && live.forecastPeak ? Math.round((live.currentDemand / live.forecastPeak) * 100) : null;
  // 대형 원전 1기를 1,000MW로 어림한 비유다 (실제 설비용량은 호기마다 다름).
  const reactorEq = live?.currentDemand ? Math.round(live.currentDemand / 1000) : null;
  const vsYearMin =
    live?.currentDemand && analysis && analysis.minDemand.demand > 0
      ? live.currentDemand / analysis.minDemand.demand
      : null;
  const nowMw = live?.currentDemand ? `${Math.round(live.currentDemand).toLocaleString('ko-KR')}MW` : null;

  const seasonalSentence = useMemo(() => {
    if (!analysis) return null;
    const seasonal = computeSeasonalComparison(analysis, [11, 15], [18, 20]);
    const spring = seasonal.spring;
    const autumn = seasonal.autumn;
    if (!spring || !autumn) return null;
    const sv = spring.daytimeMinNetLoad.value;
    const av = autumn.daytimeMinNetLoad.value;
    return {
      deeper: sv < av ? '봄' : '가을',
      gapPct: (Math.abs(av - sv) / Math.max(sv, av)) * 100,
      steeper: spring.eveningRamp > autumn.eveningRamp ? '봄' : '가을',
      springRamp: spring.eveningRamp,
      autumnRamp: autumn.eveningRamp,
    };
  }, [analysis]);

  const shown = stage === 'demand' ? demandStory(hour) : duckStory(hour);
  const nowDemand = demandStory(nowHour);
  const nowDuck = duckStory(nowHour);

  return (
    <div className="space-y-8 py-2 max-w-5xl mx-auto">
      {/* 이야기 지도 */}
      <nav aria-label="이야기 목차" className="flex flex-wrap gap-1.5">
        {[
          ['ch1', '1 지금'],
          ['ch2', '2 하루'],
          ['ch3', '3 반전'],
          ['ch4', '4 그래서'],
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

      {/* 1~3막: 같은 그림을 보면서 이야기가 이어진다 */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        {/* 고정되는 그림 (모바일: 위쪽에 붙음, 데스크톱: 오른쪽에 붙음) */}
        <aside
          aria-label="오늘의 전기 그림"
          className="sticky top-[68px] z-30 lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start -mx-1 px-1 pb-2 lg:mx-0 lg:px-0 lg:pb-0 bg-slate-50/95 backdrop-blur-sm lg:bg-transparent"
        >
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div
              className={`mx-auto max-w-[17rem] sm:max-w-md lg:max-w-none p-2 pb-0 transition-colors ${
                stage === 'duck' ? 'bg-amber-50/40' : 'bg-teal-50/40'
              }`}
            >
              <div
                className={`rounded-xl overflow-hidden border ${
                  stage === 'duck' ? 'border-amber-200/70' : 'border-teal-200/70'
                }`}
              >
                <DuckCurveIllustration stage={stage} markerHour={hour} onMarkerChange={setHour} />
              </div>
            </div>

            <div className="px-3 pt-2 pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  aria-label="시간 선택"
                  className="flex-1 accent-teal-700"
                />
                <button
                  type="button"
                  onClick={() => setHour(nowHour)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-teal-300 text-teal-800 bg-teal-50 hover:bg-teal-100 cursor-pointer whitespace-nowrap"
                >
                  지금({nowHour}시)
                </button>
              </div>
              <div aria-live="polite">
                <p className="text-xs font-bold text-teal-900">
                  {hour === nowHour && <span className="mr-1.5 px-1.5 py-px rounded-sm bg-rose-50 text-rose-600 text-[10px]">지금</span>}
                  {hour}시 · {shown.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 leading-snug line-clamp-2 lg:line-clamp-none">{shown.text}</p>
              </div>
              <p className="hidden lg:block text-[11px] text-slate-400 leading-snug">
                일반적인 하루 모양을 단순하게 그린 예시이고 실제 측정값이 아니에요.
              </p>
            </div>
          </div>
        </aside>

        {/* 이야기 본문 */}
        <div className="lg:col-start-1 lg:row-start-1 space-y-12 pt-4 lg:pt-0 pb-8">
          {/* 1막 */}
          <section id="ch1" className="scroll-mt-24 space-y-4">
            <ChapterHeader num={1} kicker="1막 · 지금" title="지금, 우리나라는 전기를 얼마나 쓰고 있을까?" />

            <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 text-white p-5 shadow-sm overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-amber-300/20 blur-2xl" aria-hidden="true" />
              <div className="relative">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-100">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-rose-300 opacity-75 animate-ping" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-400" />
                  </span>
                  지금 {nowHour}시, 우리나라가 쓰는 전기
                </p>

                {live?.currentDemand ? (
                  <>
                    <p className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight font-mono-num">
                      {Math.round(live.currentDemand).toLocaleString('ko-KR')}
                      <span className="ml-1 text-lg font-semibold text-teal-100">MW</span>
                    </p>
                    {pctOfForecast !== null && (
                      <div className="mt-3 max-w-md">
                        <div className="flex justify-between text-xs text-teal-100 mb-1">
                          <span>오늘 예상 최고치 대비</span>
                          <span className="font-mono-num font-semibold">{pctOfForecast}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-300 transition-all"
                            style={{ width: `${Math.min(100, pctOfForecast)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-3 text-sm text-teal-50 leading-relaxed">
                      {reactorEq !== null && <>대형 원전 약 {reactorEq}기가 내는 전기와 맞먹어요. </>}
                      {vsYearMin !== null && <>올해 가장 한가했던 순간의 {vsYearMin.toFixed(1)}배예요.</>}
                    </p>
                    <p className="mt-1 text-[11px] text-teal-200/90">
                      한국전력거래소 실시간 값 · 원전 1기는 1,000MW로 어림한 비유예요
                    </p>
                  </>
                ) : liveFailed ? (
                  <p className="mt-2 text-sm text-teal-50">지금 전력 수요를 불러오지 못했어요. 이야기는 그대로 볼 수 있어요.</p>
                ) : (
                  <div className="mt-2 h-14 w-48 rounded-xl bg-white/15 animate-pulse" aria-hidden="true" />
                )}
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              그림 속 <b className="text-teal-800">● 표시</b>가 바로 지금({nowHour}시)이에요. {nowDemand.text}
            </p>
            <Connector
              text={`${nowMw ?? '이 숫자'}는 하루 중 어느 정도일까요? 하루를 쭉 따라가 봐요`}
              target="ch2"
            />
          </section>

          {/* 2막 */}
          <section id="ch2" className="scroll-mt-[22rem] lg:scroll-mt-24 space-y-4">
            <ChapterHeader num={2} kicker="2막 · 하루" title="하루 동안 전기는 어떻게 움직일까?" />
            <p className="text-sm text-slate-700 leading-relaxed">
              사람들이 일어나고, 일하고, 집에 돌아오는 리듬을 따라 전기 사용량도 오르내려요. 그림 위를 누르거나 끌면서
              아침부터 한밤까지 따라가 보세요.
            </p>
            <p className="text-sm text-slate-700 leading-relaxed p-3.5 rounded-xl bg-white border border-slate-200">
              지금({nowHour}시)은 <b className="text-teal-800">{nowDemand.title}</b>이에요. {nowDemand.text}
            </p>
            <Connector text="그런데 발전소가 실제로 채우는 전기는 이 곡선 그대로가 아니에요" target="ch3" />
          </section>

          {/* 3막 */}
          <section id="ch3" className="scroll-mt-[22rem] lg:scroll-mt-24 space-y-4">
            <ChapterHeader num={3} kicker="3막 · 반전" title="태양광이 만든 전기를 빼 보면?" />
            <p className="text-sm text-slate-700 leading-relaxed">
              낮에는 태양광이 전기를 만들어 줘요. 그러면 다른 발전소가 채울 몫은{' '}
              <b>사용량에서 태양광이 만든 만큼을 뺀 값</b>이 되죠. 위의 그림이 바로 그 값이에요.
            </p>

            <div role="group" aria-label="그림 보기 방식" className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                aria-pressed={stage === 'demand'}
                onClick={() => setStage('demand')}
                className={`px-3.5 py-1.5 rounded-full cursor-pointer transition-colors ${
                  stage === 'demand' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                태양광 없이
              </button>
              <button
                type="button"
                aria-pressed={stage === 'duck'}
                onClick={() => setStage('duck')}
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full cursor-pointer transition-colors ${
                  stage === 'duck' ? 'bg-amber-400 text-amber-950 shadow-xs' : 'text-slate-500'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                태양광 켜기
              </button>
            </div>

            <p className="text-sm font-semibold text-slate-900 leading-relaxed break-keep">
              오리를 닮았죠? 그래서 이름이 <span className="text-orange-700">덕 커브(Duck Curve)</span>예요.
            </p>
            <p className="text-sm text-slate-700 leading-relaxed p-3.5 rounded-xl bg-white border border-slate-200">
              지금({nowHour}시)은 <b className="text-orange-700">{nowDuck.title}</b>이에요. {nowDuck.text}
            </p>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <h3 className="font-bold text-sm text-slate-900">봄과 가을, 언제 오리가 더 뚱뚱할까?</h3>
              </div>
              <div className="p-4 space-y-3">
                {seasonalSentence ? (
                  <>
                    <p className="text-sm text-slate-800 leading-relaxed">
                      낮의 ‘배’는 <b className="text-teal-800">{seasonalSentence.deeper}</b>이 더 깊어요. 가장 낮은 값이{' '}
                      {seasonalSentence.gapPct.toFixed(0)}% 더 낮아요.
                    </p>
                    <p className="text-sm text-slate-800 leading-relaxed">
                      저녁에 다시 올라가는 폭은 <b className="text-teal-800">{seasonalSentence.steeper}</b>이 더 커요.
                      <span className="block text-xs text-slate-500 mt-1 font-mono-num">
                        봄 {Math.round(seasonalSentence.springRamp).toLocaleString('ko-KR')} MWh · 가을{' '}
                        {Math.round(seasonalSentence.autumnRamp).toLocaleString('ko-KR')} MWh
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      공공 전력 데이터를 올리면 봄과 가을 중 언제 낮 전기가 더 많이 남는지, 저녁에 얼마나 급하게 올라가는지
                      바로 알려 줘요.
                    </p>
                    <button
                      type="button"
                      onClick={onGoToData}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      내 데이터로 확인하기
                    </button>
                  </>
                )}

                <details className="group rounded-xl border border-slate-200">
                  <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs font-semibold text-teal-800">
                    <span>그래프로 자세히 보기</span>
                    <span className="text-slate-400 group-open:rotate-90 transition-transform" aria-hidden="true">
                      ›
                    </span>
                  </summary>
                  <div className="p-2 sm:p-3 border-t border-slate-100">{seasonalDetail}</div>
                </details>
              </div>
            </div>

            <Connector text="낮에 이렇게 전기가 남으면, 현실에서는 어떤 일이 벌어질까요?" target="ch4" />
          </section>
        </div>
      </div>

      {/* 4막: 그림 없이 전체 폭으로 */}
      <section id="ch4" className="scroll-mt-24 space-y-4">
        <ChapterHeader num={4} kicker="4막 · 그래서" title="오리의 배가 깊어지면 생기는 일" />
        <p className="text-sm text-slate-700 leading-relaxed">
          낮에 전기가 남으면 발전소는 만드는 전기를 일부러 줄여야 하고(<b>출력제어</b>), 저녁에는 반대로 짧은 시간에 확 늘려야
          해요. 실제로 이런 일이 이미 벌어지고 있어요.
        </p>

        {realCases}

        <div className="rounded-2xl bg-amber-50/70 border border-amber-200 shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/70">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-sm text-slate-900">오리의 머리를 낮추려면, 우리가 할 수 있는 것</h3>
          </div>
          <ul className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIPS.map((t) => (
              <li key={t.title} className="p-3 rounded-xl bg-white border border-amber-100">
                <p className="text-sm font-bold text-slate-900 break-keep">{t.title}</p>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">{t.text}</p>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 text-[11px] text-slate-500 leading-snug">
            전기 사용 시간을 옮기는 일반적인 방법이에요. 집마다 상황이 다르니 가능한 만큼만 해 보세요.
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <MessageCircle className="w-4 h-4 text-teal-700" />
            <h3 className="font-bold text-sm text-slate-900">AI에게 쉽게 설명해 달라고 하기</h3>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              올려 둔 데이터의 숫자를 바탕으로, 봄과 가을의 오리 모양이 어떻게 다른지 쉬운 말로 풀어 줘요.
            </p>
            <button
              type="button"
              onClick={ai.onGenerate}
              disabled={!analysis || ai.loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {ai.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {ai.loading ? '설명을 쓰는 중…' : 'AI 설명 받기'}
            </button>
            {!analysis && (
              <p className="text-[11px] text-slate-500">
                전력 데이터를 먼저 올려 주세요.{' '}
                <button type="button" onClick={onGoToData} className="font-semibold text-teal-700 hover:underline cursor-pointer">
                  내 데이터로 이동
                </button>
              </p>
            )}
            {ai.error && (
              <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {ai.error}
              </p>
            )}
            {ai.text && (
              <p className="text-sm text-slate-800 leading-relaxed p-3.5 rounded-xl bg-teal-50/70 border border-teal-100 whitespace-pre-line">
                {ai.text}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-100/70 border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-bold text-slate-900">더 알아보고 싶다면</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGoToNews}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:border-teal-600 hover:text-teal-700 cursor-pointer"
            >
              <Newspaper className="w-3.5 h-3.5" />
              전력 뉴스 보기 <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onGoToData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:border-teal-600 hover:text-teal-700 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              내 데이터로 직접 분석하기 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <details className="group">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none select-none">
              <BookOpen className="w-4 h-4 text-teal-700" />
              <h3 className="font-bold text-sm text-slate-900 flex-1">어려운 말, 쉽게 풀어 볼게요</h3>
              <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform" aria-hidden="true">
                ›
              </span>
            </summary>
            <dl className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
              {GLOSSARY.map((g) => (
                <div key={g.term}>
                  <dt className="text-xs font-bold text-teal-800">{g.term}</dt>
                  <dd className="text-xs text-slate-700 leading-relaxed mt-0.5">{g.def}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </section>
    </div>
  );
};
