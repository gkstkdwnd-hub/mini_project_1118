import React, { useMemo, useState } from 'react';
import {
  Info,
  Lock,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  AnalysisResult,
  SeasonalComparisonResult,
  computeSeasonalComparison,
} from '../utils/kpxParser';

type SeasonMode = 'spring' | 'autumn' | 'both';

interface SeasonalComparisonViewProps {
  analysis: AnalysisResult | null;
  dayRange: [number, number];
  eveningRange: [number, number];
  onChangeDayRange: (next: [number, number]) => void;
  onChangeEveningRange: (next: [number, number]) => void;
  onGoToSummary: () => void;
  aiText: string | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAi: () => void;
}

const DEFAULT_DAY_RANGE: [number, number] = [11, 15];
const DEFAULT_EVENING_RANGE: [number, number] = [18, 20];

function formatMwh(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')} MWh`;
}

interface DualHourRangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  accentColorClass: string;
  barColorClass: string;
}

const DualHourRangeSlider: React.FC<DualHourRangeSliderProps> = ({
  label,
  min,
  max,
  value,
  onChange,
  accentColorClass,
  barColorClass,
}) => {
  const [start, end] = value;
  const total = max - min;
  const leftPct = ((start - min) / total) * 100;
  const rightPct = ((end - min) / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-mono-num font-bold text-slate-900">
          {start}시 ~ {end}시
        </span>
      </div>

      <div className="relative h-7 flex items-center select-none">
        {/* Background Track */}
        <div className="w-full h-1.5 bg-slate-200 rounded-full relative">
          <div
            className={`absolute top-0 h-1.5 rounded-full ${barColorClass}`}
            style={{
              left: `${leftPct}%`,
              width: `${Math.max(rightPct - leftPct, 0)}%`,
            }}
          />
        </div>

        {/* Start Hour Slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={start}
          aria-label={`${label} 시작 시간`}
          onChange={(e) => {
            const nextStart = Math.min(Number(e.target.value), end);
            onChange([nextStart, end]);
          }}
          className={`dual-range-input absolute inset-0 w-full h-7 ${accentColorClass} ${
            start >= max - 1 ? 'z-20' : 'z-10'
          }`}
        />

        {/* End Hour Slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={end}
          aria-label={`${label} 끝 시간`}
          onChange={(e) => {
            const nextEnd = Math.max(Number(e.target.value), start);
            onChange([start, nextEnd]);
          }}
          className={`dual-range-input absolute inset-0 w-full h-7 ${accentColorClass} z-10`}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono-num text-slate-400">
        <span>{min}시</span>
        <span>{max}시</span>
      </div>
    </div>
  );
};

export const SeasonalComparisonView: React.FC<SeasonalComparisonViewProps> = ({
  analysis,
  dayRange,
  eveningRange,
  onChangeDayRange,
  onChangeEveningRange,
  onGoToSummary,
  aiText,
  aiLoading,
  aiError,
  onGenerateAi,
}) => {
  const [mode, setMode] = useState<SeasonMode>('both');
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const seasonal: SeasonalComparisonResult | null = useMemo(() => {
    if (!analysis) return null;
    return computeSeasonalComparison(analysis, dayRange, eveningRange);
  }, [analysis, dayRange, eveningRange]);

  const spring = seasonal?.spring ?? null;
  const autumn = seasonal?.autumn ?? null;

  const [dayStart, dayEnd] = dayRange;
  const [eveningStart, eveningEnd] = eveningRange;

  // Determine chart geometry
  const width = 400;
  const height = 220;
  const padLeft = 52;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (hour: number) => padLeft + ((hour - 1) / 23) * plotW;

  const activeStats =
    mode === 'spring' ? spring : mode === 'autumn' ? autumn : null;
  const hasChartData =
    mode === 'both'
      ? Boolean(spring && autumn) || Boolean(spring) || Boolean(autumn)
      : Boolean(activeStats);

  // Compute dynamic Y scale strictly from calculated values
  const chartScale = useMemo(() => {
    if (!hasChartData) {
      return null;
    }

    const values: number[] = [];
    if (mode === 'both') {
      if (spring) {
        spring.hourlyAverages
          .filter((h) => h.count > 0)
          .forEach((h) => values.push(h.avgNetLoad));
      }
      if (autumn) {
        autumn.hourlyAverages
          .filter((h) => h.count > 0)
          .forEach((h) => values.push(h.avgNetLoad));
      }
    } else if (activeStats) {
      activeStats.hourlyAverages
        .filter((h) => h.count > 0)
        .forEach((h) => {
          values.push(h.avgDemand, h.avgSolar, h.avgNetLoad);
        });
    }

    if (values.length === 0) return null;

    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(...values);
    const span = Math.max(rawMax - rawMin, 1);
    const minVal = rawMin === 0 ? 0 : rawMin - span * 0.08;
    const maxVal = rawMax + span * 0.08;

    return { minVal, maxVal };
  }, [hasChartData, mode, spring, autumn, activeStats]);

  const toY = (val: number) => {
    if (!chartScale) return padTop + plotH;
    return (
      padTop +
      plotH -
      ((val - chartScale.minVal) / (chartScale.maxVal - chartScale.minVal)) * plotH
    );
  };

  const springNetAreaPath = useMemo(() => {
    const targetStats = mode === 'autumn' ? autumn : spring;
    if (!targetStats || !chartScale) return '';
    const pts = targetStats.hourlyAverages
      .filter((h) => h.count > 0)
      .map((h) => ({
        x: toX(h.hour),
        y: toY(h.avgNetLoad),
      }));
    if (pts.length < 2) return '';
    const first = pts[0];
    const last = pts[pts.length - 1];
    const baselineY = padTop + plotH;
    let d = `M ${first.x.toFixed(1)} ${baselineY}`;
    for (const p of pts) {
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    d += ` L ${last.x.toFixed(1)} ${baselineY} Z`;
    return d;
  }, [spring, autumn, mode, chartScale, plotH]);

  const buildPolyline = (
    points: { hour: number; val: number; count: number }[]
  ) =>
    points
      .filter((p) => p.count > 0)
      .map((p) => `${toX(p.hour).toFixed(1)},${toY(p.val).toFixed(1)}`)
      .join(' ');

  // Conclusion calculation
  const conclusionText = useMemo(() => {
    if (!analysis) {
      return null;
    }
    if (!spring || !autumn) {
      return '봄(3~5월)과 가을(9~11월) 데이터가 모두 있어야 비교할 수 있습니다';
    }
    const springMin = spring.daytimeMinNetLoad.value;
    const autumnMin = autumn.daytimeMinNetLoad.value;
    if (Math.round(springMin) === Math.round(autumnMin)) {
      return `낮 최저 순부하가 더 낮은 계절은 봄·가을 동일입니다 (봄 ${formatMwh(springMin)} / 가을 ${formatMwh(autumnMin)})`;
    }
    const lowerSeason = springMin < autumnMin ? '봄' : '가을';
    return `낮 최저 순부하가 더 낮은 계절은 ${lowerSeason}입니다 (봄 ${formatMwh(springMin)} / 가을 ${formatMwh(autumnMin)})`;
  }, [analysis, spring, autumn]);

  const yTicks = useMemo(() => {
    if (!chartScale) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val =
        chartScale.maxVal - (chartScale.maxVal - chartScale.minVal) * ratio;
      const y = padTop + plotH * ratio;
      return { val, y };
    });
  }, [chartScale, plotH]);

  const inspectedData = useMemo(() => {
    if (!hoverHour || !hasChartData) return null;
    if (mode === 'both') {
      const sp = spring?.hourlyAverages.find((h) => h.hour === hoverHour);
      const au = autumn?.hourlyAverages.find((h) => h.hour === hoverHour);
      return {
        kind: 'both' as const,
        hour: hoverHour,
        springNet: sp && sp.count > 0 ? sp.avgNetLoad : null,
        autumnNet: au && au.count > 0 ? au.avgNetLoad : null,
      };
    }
    const pt = activeStats?.hourlyAverages.find((h) => h.hour === hoverHour);
    if (!pt || pt.count === 0) return null;
    return {
      kind: 'single' as const,
      hour: hoverHour,
      demand: pt.avgDemand,
      solar: pt.avgSolar,
      netLoad: pt.avgNetLoad,
    };
  }, [hoverHour, hasChartData, mode, spring, autumn, activeStats]);

  // Shaded band geometry on 24h chart for dayRange and eveningRange
  const stepW = plotW / 23;
  const dayBandX1 = Math.max(padLeft, toX(dayStart) - stepW * 0.35);
  const dayBandX2 = Math.min(width - padRight, toX(dayEnd) + stepW * 0.35);
  const eveningBandX1 = Math.max(padLeft, toX(eveningStart) - stepW * 0.35);
  const eveningBandX2 = Math.min(
    width - padRight,
    toX(eveningEnd) + stepW * 0.35
  );

  const isDefaultRange =
    dayStart === DEFAULT_DAY_RANGE[0] &&
    dayEnd === DEFAULT_DAY_RANGE[1] &&
    eveningStart === DEFAULT_EVENING_RANGE[0] &&
    eveningEnd === DEFAULT_EVENING_RANGE[1];

  return (
    <div className="space-y-4 py-2">
      {/* Empty / Guidance notice when files aren't loaded yet */}
      {!analysis && (
        <div
          role="status"
          className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-slate-700"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="text-xs font-medium">
              데이터 요약 탭에서 두 파일을 모두 올려 주세요
            </span>
          </div>
          <button
            type="button"
            onClick={onGoToSummary}
            className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
          >
            데이터 요약으로 이동
          </button>
        </div>
      )}

      {/* Time Window Range Sliders */}
      <section className="w-full bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900">
            계산 구간 설정
          </h2>
          <button
            type="button"
            disabled={isDefaultRange}
            onClick={() => {
              onChangeDayRange(DEFAULT_DAY_RANGE);
              onChangeEveningRange(DEFAULT_EVENING_RANGE);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:text-teal-700 hover:border-teal-500 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>기본값으로</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DualHourRangeSlider
            label="낮 구간"
            min={8}
            max={17}
            value={dayRange}
            onChange={onChangeDayRange}
            accentColorClass="text-orange-600"
            barColorClass="bg-orange-500"
          />

          <DualHourRangeSlider
            label="저녁 구간"
            min={16}
            max={23}
            value={eveningRange}
            onChange={onChangeEveningRange}
            accentColorClass="text-teal-700"
            barColorClass="bg-teal-600"
          />
        </div>
      </section>

      {/* Season Selector Controller */}
      <section className="w-full bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
        <div
          aria-label="계절 비교 모드 선택"
          className="grid grid-cols-3 gap-1"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'spring'}
            onClick={() => {
              setMode('spring');
              setHoverHour(null);
            }}
            className={`py-2 px-2 text-center rounded-lg text-xs transition-colors cursor-pointer ${
              mode === 'spring'
                ? 'bg-teal-700 text-white font-bold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium'
            }`}
          >
            봄 <span className="opacity-80 text-[10px] block font-normal">(3~5월)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'autumn'}
            onClick={() => {
              setMode('autumn');
              setHoverHour(null);
            }}
            className={`py-2 px-2 text-center rounded-lg text-xs transition-colors cursor-pointer ${
              mode === 'autumn'
                ? 'bg-teal-700 text-white font-bold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium'
            }`}
          >
            가을 <span className="opacity-80 text-[10px] block font-normal">(9~11월)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'both'}
            onClick={() => {
              setMode('both');
              setHoverHour(null);
            }}
            className={`py-2 px-2 text-center rounded-lg text-xs transition-colors cursor-pointer ${
              mode === 'both'
                ? 'bg-teal-700 text-white font-bold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium'
            }`}
          >
            동시 비교{' '}
            <span className="opacity-80 text-[10px] block font-normal">
              (봄 &amp; 가을 중첩)
            </span>
          </button>
        </div>
      </section>

      {/* Graph Reading Guide */}
      <div className="px-3 py-2 rounded-xl bg-teal-50/70 border border-teal-100 text-xs text-teal-900 font-medium">
        주황선(봄)이 청록선(가을)보다 낮에 더 깊게 꺼질수록 봄의 덕 커브가 더 심하다는 뜻이에요.
      </div>

      {/* 24-Hour Seasonal Duck Curve Chart */}
      <section className="w-full bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              24시간 시간대별 평균 부하 곡선
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            {mode === 'spring'
              ? '봄 (3~5월)'
              : mode === 'autumn'
              ? '가을 (9~11월)'
              : '봄 · 가을 순부하 중첩'}
          </span>
        </div>

        {/* Dynamic Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {mode === 'both' ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-orange-600 inline-block rounded-full" />
                <span>봄 평균 순부하</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-teal-600 inline-block rounded-full" />
                <span>가을 평균 순부하</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-blue-600 inline-block rounded-full" />
                <span>평균 수요</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-yellow-500 inline-block rounded-full" />
                <span>평균 태양광</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-orange-600 inline-block rounded-full" />
                <span>평균 순부하</span>
              </div>
            </>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-xs bg-orange-400/20 border border-orange-300/60 inline-block" />
            <span>낮 구간</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-3 rounded-xs bg-teal-500/20 border border-teal-400/60 inline-block" />
            <span>저녁 구간</span>
          </div>
        </div>

        {/* SVG Chart Container */}
        <div className="relative w-full bg-slate-50/80 rounded-lg border border-slate-200/80 p-2">
          {hasChartData && chartScale ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-56 sm:h-64 overflow-visible select-none"
              role="img"
              aria-label="봄과 가을 24시간 평균 부하 곡선"
              onMouseLeave={() => setHoverHour(null)}
            >
              {/* Shaded Daytime & Evening Interval Backgrounds */}
              <rect
                x={dayBandX1}
                y={padTop}
                width={Math.max(dayBandX2 - dayBandX1, 4)}
                height={plotH}
                fill="rgba(251, 146, 60, 0.14)"
              />
              <text
                x={(dayBandX1 + dayBandX2) / 2}
                y={padTop - 4}
                textAnchor="middle"
                fontSize="8"
                fill="#c2410c"
                fontWeight="600"
              >
                낮 ({dayStart}~{dayEnd}시)
              </text>

              <rect
                x={eveningBandX1}
                y={padTop}
                width={Math.max(eveningBandX2 - eveningBandX1, 4)}
                height={plotH}
                fill="rgba(20, 184, 166, 0.14)"
              />
              <text
                x={(eveningBandX1 + eveningBandX2) / 2}
                y={padTop - 4}
                textAnchor="middle"
                fontSize="8"
                fill="#0f766e"
                fontWeight="600"
              >
                저녁 ({eveningStart}~{eveningEnd}시)
              </text>

              {/* Horizontal Grid Lines + Computed Y Ticks */}
              {yTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    x2={width - padRight}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 6}
                    y={tick.y + 3}
                    textAnchor="end"
                    fontSize="8.5"
                    fill="#64748b"
                    className="font-mono-num"
                  >
                    {Math.round(tick.val).toLocaleString('ko-KR')}
                  </text>
                </g>
              ))}

              {/* Baseline */}
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={padTop + plotH}
                y2={padTop + plotH}
                stroke="#94a3b8"
                strokeWidth="1"
              />

              {/* Vertical Hour Guides + X-Axis Labels */}
              {[1, 4, 8, 12, 14, 18, 21, 24].map((h) => {
                const x = toX(h);
                return (
                  <g key={h}>
                    <line
                      x1={x}
                      x2={x}
                      y1={padTop}
                      y2={padTop + plotH}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={height - 8}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="#64748b"
                      className="font-mono-num"
                    >
                      {h}시
                    </text>
                  </g>
                );
              })}

              {/* Hover Vertical Indicator */}
              {hoverHour !== null && (
                <line
                  x1={toX(hoverHour)}
                  x2={toX(hoverHour)}
                  y1={padTop}
                  y2={padTop + plotH}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
              )}

              {/* Net Load Area Fill */}
              {springNetAreaPath && (
                <path d={springNetAreaPath} fill="#ea580c" fillOpacity="0.1" />
              )}

              {/* Data Polylines */}
              {mode === 'both' ? (
                <>
                  {spring && (
                    <polyline
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={buildPolyline(
                        spring.hourlyAverages.map((h) => ({
                          hour: h.hour,
                          val: h.avgNetLoad,
                          count: h.count,
                        }))
                      )}
                    />
                  )}
                  {autumn && (
                    <polyline
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={buildPolyline(
                        autumn.hourlyAverages.map((h) => ({
                          hour: h.hour,
                          val: h.avgNetLoad,
                          count: h.count,
                        }))
                      )}
                    />
                  )}
                </>
              ) : activeStats ? (
                <>
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={buildPolyline(
                      activeStats.hourlyAverages.map((h) => ({
                        hour: h.hour,
                        val: h.avgDemand,
                        count: h.count,
                      }))
                    )}
                  />
                  <polyline
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={buildPolyline(
                      activeStats.hourlyAverages.map((h) => ({
                        hour: h.hour,
                        val: h.avgSolar,
                        count: h.count,
                      }))
                    )}
                  />
                  <polyline
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={buildPolyline(
                      activeStats.hourlyAverages.map((h) => ({
                        hour: h.hour,
                        val: h.avgNetLoad,
                        count: h.count,
                      }))
                    )}
                  />
                </>
              ) : null}

              {/* Interactive Hit Columns for Each Hour */}
              {Array.from({ length: 24 }, (_, idx) => idx + 1).map((h) => {
                const colWidth = plotW / 23;
                const x = toX(h) - colWidth / 2;
                return (
                  <rect
                    key={h}
                    x={Math.max(padLeft, x)}
                    y={padTop}
                    width={colWidth}
                    height={plotH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoverHour(h)}
                    onClick={() => setHoverHour(h)}
                  />
                );
              })}
            </svg>
          ) : (
            <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-center px-4">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-44 opacity-65"
                aria-hidden="true"
              >
                <rect
                  x={dayBandX1}
                  y={padTop}
                  width={Math.max(dayBandX2 - dayBandX1, 4)}
                  height={plotH}
                  fill="rgba(251, 146, 60, 0.14)"
                />
                <rect
                  x={eveningBandX1}
                  y={padTop}
                  width={Math.max(eveningBandX2 - eveningBandX1, 4)}
                  height={plotH}
                  fill="rgba(20, 184, 166, 0.14)"
                />
                {[0.2, 0.4, 0.6, 0.8].map((r) => (
                  <line
                    key={r}
                    x1="24"
                    x2={width - 24}
                    y1={height * r}
                    y2={height * r}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                ))}
              </svg>
              <p className="text-xs text-slate-400 -mt-20">
                파일이 업로드되면 계산된 계절별 평균 곡선이 표시됩니다
              </p>
            </div>
          )}
        </div>

        {/* Inspected Hour Readout (only when hovering/tapping a point on calculated graph) */}
        {inspectedData && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="font-bold font-mono-num text-slate-800">
              {inspectedData.hour}시 평균
            </span>
            {inspectedData.kind === 'both' ? (
              <div className="flex flex-wrap items-center gap-3 font-mono-num">
                <span className="text-orange-700">
                  봄 순부하:{' '}
                  {inspectedData.springNet !== null
                    ? formatMwh(inspectedData.springNet)
                    : '—'}
                </span>
                <span className="text-teal-700">
                  가을 순부하:{' '}
                  {inspectedData.autumnNet !== null
                    ? formatMwh(inspectedData.autumnNet)
                    : '—'}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 font-mono-num">
                <span className="text-blue-700">
                  수요: {formatMwh(inspectedData.demand)}
                </span>
                <span className="text-yellow-700">
                  태양광: {formatMwh(inspectedData.solar)}
                </span>
                <span className="text-orange-700 font-semibold">
                  순부하: {formatMwh(inspectedData.netLoad)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 2 Metric Cards Below Graph: "낮 최저 순부하" and "저녁 상승폭" */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-600 shrink-0" />
              <span className="text-xs text-slate-600 font-medium">
                낮 최저 순부하
              </span>
            </div>
            {mode === 'both' ? (
              <div className="mt-1.5 space-y-0.5 font-mono-num text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-orange-700 font-medium">봄 (3~5월)</span>
                  <span className="font-bold text-slate-900">
                    {spring
                      ? `${formatMwh(spring.daytimeMinNetLoad.value)} (${spring.daytimeMinNetLoad.hour}시)`
                      : '— MWh'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-teal-700 font-medium">가을 (9~11월)</span>
                  <span className="font-bold text-slate-900">
                    {autumn
                      ? `${formatMwh(autumn.daytimeMinNetLoad.value)} (${autumn.daytimeMinNetLoad.hour}시)`
                      : '— MWh'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold font-mono-num text-slate-900">
                  {activeStats
                    ? formatMwh(activeStats.daytimeMinNetLoad.value)
                    : '— MWh'}
                </span>
                <span className="text-xs font-mono-num text-slate-500">
                  {activeStats ? `${activeStats.daytimeMinNetLoad.hour}시` : '—'}
                </span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-xs text-slate-600 font-medium">
                저녁 상승폭
              </span>
            </div>
            {mode === 'both' ? (
              <div className="mt-1.5 space-y-0.5 font-mono-num text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-orange-700 font-medium">봄 (3~5월)</span>
                  <span className="font-bold text-slate-900">
                    {spring ? formatMwh(spring.eveningRamp) : '— MWh'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-teal-700 font-medium">가을 (9~11월)</span>
                  <span className="font-bold text-slate-900">
                    {autumn ? formatMwh(autumn.eveningRamp) : '— MWh'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold font-mono-num text-slate-900">
                  {activeStats ? formatMwh(activeStats.eveningRamp) : '— MWh'}
                </span>
                <span className="text-xs font-mono-num text-slate-500">
                  {activeStats
                    ? `최대 ${activeStats.eveningPeakNetLoad.hour}시`
                    : '—'}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Structured Seasonal Comparison Table */}
      <section className="w-full bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
          봄·가을 지표 비교
        </h3>

        <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-12 bg-slate-100 py-2.5 px-3 text-xs font-semibold border-b border-slate-200">
            <div className="col-span-4 text-slate-600">분석 항목</div>
            <div className="col-span-4 text-center text-orange-700 font-bold">
              봄 (3~5월)
            </div>
            <div className="col-span-4 text-right text-teal-700 font-bold">
              가을 (9~11월)
            </div>
          </div>

          {/* Row 1: 낮 최저 순부하 (시간 포함) */}
          <div className="grid grid-cols-12 py-3 px-3 items-center border-b border-slate-100">
            <div className="col-span-4 flex flex-col min-w-0">
              <span className="text-xs sm:text-sm text-slate-900 font-semibold">
                낮 최저 순부하
              </span>
              <span className="text-[11px] text-slate-500">
                {dayStart}시부터 {dayEnd}시 중 최저
              </span>
            </div>
            <div className="col-span-4 text-center font-mono-num">
              <div className="text-xs sm:text-sm font-bold text-slate-900">
                {spring ? formatMwh(spring.daytimeMinNetLoad.value) : '— MWh'}
              </div>
              <div className="text-[11px] text-slate-500">
                {spring ? `${spring.daytimeMinNetLoad.hour}시` : '—'}
              </div>
            </div>
            <div className="col-span-4 text-right font-mono-num">
              <div className="text-xs sm:text-sm font-bold text-slate-900">
                {autumn ? formatMwh(autumn.daytimeMinNetLoad.value) : '— MWh'}
              </div>
              <div className="text-[11px] text-slate-500">
                {autumn ? `${autumn.daytimeMinNetLoad.hour}시` : '—'}
              </div>
            </div>
          </div>

          {/* Row 2: 저녁 상승폭 */}
          <div className="grid grid-cols-12 py-3 px-3 items-center bg-slate-50/50 border-b border-slate-100">
            <div className="col-span-4 flex flex-col min-w-0">
              <span className="text-xs sm:text-sm text-slate-900 font-semibold">
                저녁 상승폭
              </span>
              <span className="text-[11px] text-slate-500">
                {eveningStart}시부터 {eveningEnd}시 중 최대 빼기 낮 최저
              </span>
            </div>
            <div className="col-span-4 text-center font-mono-num">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                {spring ? formatMwh(spring.eveningRamp) : '— MWh'}
              </span>
            </div>
            <div className="col-span-4 text-right font-mono-num">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                {autumn ? formatMwh(autumn.eveningRamp) : '— MWh'}
              </span>
            </div>
          </div>

          {/* Row 3: 기록일 (실제 하루 최저 순부하 날짜와 시간) */}
          <div className="grid grid-cols-12 py-3 px-3 items-center">
            <div className="col-span-4 flex flex-col min-w-0">
              <span className="text-xs sm:text-sm text-slate-900 font-semibold">
                기록일
              </span>
              <span className="text-[11px] text-slate-500">
                계절 내 최저 순부하 일시
              </span>
            </div>
            <div className="col-span-4 text-center font-mono-num">
              <div className="text-xs font-semibold text-slate-800">
                {spring ? spring.recordLowPoint.date : '—'}
              </div>
              <div className="text-[11px] text-slate-500">
                {spring
                  ? `${spring.recordLowPoint.hour}시 · ${formatMwh(spring.recordLowPoint.netLoad)}`
                  : '—'}
              </div>
            </div>
            <div className="col-span-4 text-right font-mono-num">
              <div className="text-xs font-semibold text-slate-800">
                {autumn ? autumn.recordLowPoint.date : '—'}
              </div>
              <div className="text-[11px] text-slate-500">
                {autumn
                  ? `${autumn.recordLowPoint.hour}시 · ${formatMwh(autumn.recordLowPoint.netLoad)}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final Conclusion Card */}
      <section className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0 text-teal-700">
            <Info className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-slate-900 font-mono-num">
            {conclusionText ?? '—'}
          </p>
        </div>
      </section>

      {/* AI Insights Section */}
      <div className="space-y-4 pt-2">
        {/* Top 3 Seasonal Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
          <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200">
            <span className="text-xs font-medium text-slate-500">
              봄 낮 최저 순부하
            </span>
            <div className="flex items-baseline gap-1 mt-2 font-mono-num">
              <span className="text-lg font-bold text-slate-900">
                {spring
                  ? Math.round(spring.daytimeMinNetLoad.value).toLocaleString('ko-KR')
                  : '—'}
              </span>
              <span className="text-xs font-medium text-slate-400">MWh</span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200">
            <span className="text-xs font-medium text-slate-500">
              가을 낮 최저 순부하
            </span>
            <div className="flex items-baseline gap-1 mt-2 font-mono-num">
              <span className="text-lg font-bold text-slate-900">
                {autumn
                  ? Math.round(autumn.daytimeMinNetLoad.value).toLocaleString('ko-KR')
                  : '—'}
              </span>
              <span className="text-xs font-medium text-slate-400">MWh</span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200">
            <span className="text-xs font-medium text-slate-500">
              저녁 상승폭 차이(봄 빼기 가을)
            </span>
            <div className="flex items-baseline gap-1 mt-2 font-mono-num">
              <span className="text-lg font-bold text-teal-700">
                {spring && autumn
                  ? Math.round(spring.eveningRamp - autumn.eveningRamp).toLocaleString('ko-KR')
                  : '—'}
              </span>
              <span className="text-xs font-medium text-slate-400">MWh</span>
            </div>
          </div>
        </section>

        {/* Action Button: AI 해설 받기 */}
        <button
          type="button"
          disabled={!analysis || aiLoading}
          onClick={onGenerateAi}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-teal-700 hover:bg-teal-800 active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-xs transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>{aiLoading ? '해설 작성 중...' : 'AI 해설 받기'}</span>
        </button>

        {/* AI Narrative Card */}
        <section className="flex flex-col w-full rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-teal-50 text-teal-700">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <h2 className="font-bold text-sm text-slate-900">AI 해설</h2>
            </div>
            <span className="text-[11px] text-slate-500 font-mono-num">
              낮 {dayRange[0]}~{dayRange[1]}시 · 저녁 {eveningRange[0]}~
              {eveningRange[1]}시 기준
            </span>
          </div>

          <div className="p-5 min-h-[112px] flex items-center justify-center">
            {aiLoading ? (
              <p className="text-sm text-teal-700 font-medium text-center">
                해설 작성 중...
              </p>
            ) : aiError ? (
              <p className="text-sm text-red-600 font-medium text-center">
                {aiError}
              </p>
            ) : aiText ? (
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line w-full">
                {aiText}
              </p>
            ) : (
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                AI 해설 받기 버튼을 누르면 여기에 해설이 표시됩니다
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
