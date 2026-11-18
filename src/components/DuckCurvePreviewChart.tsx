import React, { useMemo, useState } from 'react';
import {
  AnalysisResult,
  FuelGenerationDataset,
  FuelHourlyAverage,
  FuelType,
  HourlyAverage,
} from '../utils/kpxParser';

export type ChartMode = 'annual' | 'selectedDate';

type SeriesKey = 'demand' | 'netLoad' | FuelType;

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
  dashed?: boolean;
}

const SERIES_LIST: SeriesMeta[] = [
  { key: 'demand', label: '수요', color: '#2563eb', dashed: true },
  { key: 'netLoad', label: '순부하', color: '#ea580c' },
  { key: '원자력', label: '원자력', color: '#64748b' },
  { key: '유연탄', label: '유연탄', color: '#92400e' },
  { key: 'LNG', label: 'LNG', color: '#1e3a8a' },
  { key: '양수', label: '양수', color: '#7c3aed' },
  { key: '태양광', label: '태양광', color: '#eab308' },
  { key: '풍력', label: '풍력', color: '#38bdf8' },
];

interface DuckCurvePreviewChartProps {
  analysis: AnalysisResult | null;
  fuelDataset: FuelGenerationDataset | null;
  fuelAnnualAverages: FuelHourlyAverage[] | null;
  selectedDate: string;
}

function formatMwhInt(val: number): string {
  return `${Math.round(val).toLocaleString('ko-KR')} MWh`;
}

export const DuckCurvePreviewChart: React.FC<DuckCurvePreviewChartProps> = ({
  analysis,
  fuelDataset,
  fuelAnnualAverages,
  selectedDate,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('annual');
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    demand: true,
    netLoad: true,
    원자력: true,
    유연탄: true,
    LNG: true,
    양수: true,
    태양광: true,
    풍력: true,
  });

  const hasFuelData = fuelDataset !== null;

  const activeSeriesList = useMemo(() => {
    if (!hasFuelData) {
      return SERIES_LIST.filter((s) => s.key === 'demand' || s.key === 'netLoad');
    }
    return SERIES_LIST;
  }, [hasFuelData]);

  // Build 24-hour point array for the active chartMode
  const hourlyPoints = useMemo(() => {
    if (!analysis) return null;

    if (chartMode === 'annual') {
      return analysis.hourlyAverages.map((h: HourlyAverage) => {
        const fuelHour = fuelAnnualAverages?.find((f) => f.hour === h.hour);
        return {
          hour: h.hour,
          demand: h.count > 0 ? h.avgDemand : null,
          netLoad: h.count > 0 ? h.avgNetLoad : null,
          원자력: fuelHour?.values.원자력 ?? null,
          유연탄: fuelHour?.values.유연탄 ?? null,
          LNG: fuelHour?.values.LNG ?? null,
          양수: fuelHour?.values.양수 ?? null,
          태양광: fuelHour?.values.태양광 ?? null,
          풍력: fuelHour?.values.풍력 ?? null,
        };
      });
    }

    // selectedDate mode: actual hourly values for selectedDate
    if (!selectedDate) return null;

    return Array.from({ length: 24 }, (_, idx) => {
      const hour = idx + 1;
      const key = `${selectedDate}|${hour}`;
      const matched = analysis.matchedMap.get(key);
      const fuelRec = fuelDataset?.points.get(key);
      return {
        hour,
        demand: matched ? matched.demand : null,
        netLoad: matched ? matched.netLoad : null,
        원자력: fuelRec?.원자력 ?? null,
        유연탄: fuelRec?.유연탄 ?? null,
        LNG: fuelRec?.LNG ?? null,
        양수: fuelRec?.양수 ?? null,
        태양광: fuelRec?.태양광 ?? null,
        풍력: fuelRec?.풍력 ?? null,
      };
    });
  }, [analysis, chartMode, fuelAnnualAverages, fuelDataset, selectedDate]);

  const hasRenderablePoints = useMemo(() => {
    if (!hourlyPoints) return false;
    return hourlyPoints.some((pt) =>
      activeSeriesList.some(
        (meta) => visibleSeries[meta.key] && pt[meta.key] !== null
      )
    );
  }, [hourlyPoints, activeSeriesList, visibleSeries]);

  const width = 440;
  const height = 210;
  const padLeft = 52;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const scale = useMemo(() => {
    if (!hourlyPoints || !hasRenderablePoints) return null;

    const vals: number[] = [];
    for (const pt of hourlyPoints) {
      for (const meta of activeSeriesList) {
        if (!visibleSeries[meta.key]) continue;
        const v = pt[meta.key];
        if (v !== null) vals.push(v);
      }
    }

    if (vals.length === 0) return null;
    const rawMin = Math.min(0, ...vals);
    const rawMax = Math.max(...vals);
    const span = Math.max(rawMax - rawMin, 1);
    const minVal = rawMin === 0 ? 0 : rawMin - span * 0.08;
    const maxVal = rawMax + span * 0.08;
    return { minVal, maxVal };
  }, [hourlyPoints, hasRenderablePoints, activeSeriesList, visibleSeries]);

  const toX = (hour: number) => padLeft + ((hour - 1) / 23) * plotW;
  const toY = (val: number) => {
    if (!scale) return padTop + plotH;
    return (
      padTop +
      plotH -
      ((val - scale.minVal) / (scale.maxVal - scale.minVal)) * plotH
    );
  };

  const yTicks = useMemo(() => {
    if (!scale) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = scale.maxVal - (scale.maxVal - scale.minVal) * ratio;
      const y = padTop + plotH * ratio;
      return { val, y };
    });
  }, [scale, plotH]);

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const hoveredPoint = useMemo(() => {
    if (!hoverHour || !hourlyPoints) return null;
    return hourlyPoints.find((p) => p.hour === hoverHour) ?? null;
  }, [hoverHour, hourlyPoints]);

  // Build contiguous polyline segments when there might be missing hours
  const buildSegments = (key: SeriesKey): string[] => {
    if (!hourlyPoints) return [];
    const segments: string[] = [];
    let current: string[] = [];

    for (const pt of hourlyPoints) {
      const val = pt[key];
      if (val !== null) {
        current.push(`${toX(pt.hour).toFixed(1)},${toY(val).toFixed(1)}`);
      } else if (current.length > 0) {
        if (current.length >= 2) {
          segments.push(current.join(' '));
        }
        current = [];
      }
    }
    if (current.length >= 2) {
      segments.push(current.join(' '));
    }
    return segments;
  };

  const netLoadAreaPath = useMemo(() => {
    if (!hourlyPoints || !scale || !visibleSeries.netLoad) return '';
    const pts = hourlyPoints
      .filter((pt) => pt.netLoad !== null)
      .map((pt) => ({
        x: toX(pt.hour),
        y: toY(pt.netLoad!),
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
  }, [hourlyPoints, scale, visibleSeries.netLoad, plotH]);

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 animate-fade-in space-y-3">
      {/* Graph Reading Guide */}
      <div className="px-3 py-2 rounded-xl bg-teal-50/70 border border-teal-100 text-xs text-teal-900 font-medium">
        선택한 날짜를 바꿔 보면서 낮 시간대에 LNG·석탄 선이 어떻게 움직이는지 보세요.
      </div>

      {/* Header & Mode Switch Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-slate-900">
            24시간 시간대별 그래프
          </h2>
          <span className="text-[11px] text-slate-500">
            {chartMode === 'annual'
              ? '1시부터 24시까지 1년 평균'
              : analysis && selectedDate
              ? `${selectedDate} 실제 값`
              : '검산기에서 날짜를 고르면 실제 값을 표시합니다'}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="그래프 기준 선택"
          className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'annual'}
            onClick={() => {
              setChartMode('annual');
              setHoverHour(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              chartMode === 'annual'
                ? 'bg-white text-teal-800 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            연간 평균
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chartMode === 'selectedDate'}
            onClick={() => {
              setChartMode('selectedDate');
              setHoverHour(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              chartMode === 'selectedDate'
                ? 'bg-white text-teal-800 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            선택한 날짜
          </button>
        </div>
      </div>

      {/* Clickable Interactive Legend with Colored Dots */}
      <div className="flex flex-wrap items-center gap-1.5">
        {activeSeriesList.map((meta) => {
          const isOn = visibleSeries[meta.key];
          return (
            <button
              key={meta.key}
              type="button"
              aria-pressed={isOn}
              onClick={() => toggleSeries(meta.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                isOn
                  ? 'bg-white border-slate-300 text-slate-800 shadow-2xs'
                  : 'bg-slate-100 border-slate-200 text-slate-400 opacity-65'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: isOn ? meta.color : '#94a3b8' }}
              />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* SVG Plot */}
      <div className="relative w-full rounded-lg bg-slate-50/80 border border-slate-200/80 p-2">
        {analysis && hasRenderablePoints && scale ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-56 sm:h-64 overflow-visible select-none"
            role="img"
            aria-label="24시간 전력수요·순부하·연료원별 발전량 선 그래프"
            onMouseLeave={() => setHoverHour(null)}
          >
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

            <line
              x1={padLeft}
              x2={width - padRight}
              y1={padTop + plotH}
              y2={padTop + plotH}
              stroke="#94a3b8"
              strokeWidth="1"
            />

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
                    y={height - 7}
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
            {visibleSeries.netLoad && netLoadAreaPath && (
              <path d={netLoadAreaPath} fill="#ea580c" fillOpacity="0.12" />
            )}

            {/* Render each active & toggled-on series */}
            {activeSeriesList.map((meta) => {
              if (!visibleSeries[meta.key]) return null;
              const segments = buildSegments(meta.key);
              return segments.map((pointsStr, segIdx) => (
                <polyline
                  key={`${meta.key}-${segIdx}`}
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={meta.key === 'netLoad' ? 2.4 : 1.9}
                  strokeDasharray={meta.dashed ? '4 3' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pointsStr}
                />
              ));
            })}

            {/* Interactive hover hit zones for hours 1..24 */}
            {Array.from({ length: 24 }, (_, idx) => idx + 1).map((h) => {
              const colW = plotW / 23;
              return (
                <rect
                  key={h}
                  x={Math.max(padLeft, toX(h) - colW / 2)}
                  y={padTop}
                  width={colW}
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
              className="w-full h-40 opacity-60"
              aria-hidden="true"
            >
              {[0.2, 0.5, 0.8].map((r) => (
                <line
                  key={r}
                  x1="20"
                  x2={width - 20}
                  y1={height * r}
                  y2={height * r}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
              ))}
            </svg>
            <p className="text-xs text-slate-400 -mt-16">
              {!analysis
                ? '전력수요와 태양광 CSV 파일을 올리면 그래프가 표시됩니다'
                : chartMode === 'selectedDate' && !selectedDate
                ? '검산기에서 날짜를 선택해 주세요'
                : '표시할 수 있는 데이터가 없거나 모든 선이 꺼져 있습니다'}
            </p>
          </div>
        )}
      </div>

      {/* Hover / Click Point Readout */}
      {hoveredPoint && (
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1">
          <div className="font-bold font-mono-num text-slate-800">
            {chartMode === 'annual' ? '연간 평균' : selectedDate} · {hoveredPoint.hour}시
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono-num">
            {activeSeriesList.map((meta) => {
              if (!visibleSeries[meta.key]) return null;
              const val = hoveredPoint[meta.key];
              return (
                <span key={meta.key} style={{ color: meta.color }}>
                  {meta.label}: {val !== null ? formatMwhInt(val) : '—'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Required Caution Caption */}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        전력시장 거래분 기준 / 연료원별 발전량과 수요는 기준이 달라 합계가 일치하지 않음 / 출력 변화의 원인은 이 데이터로 판단할 수 없음 / 양수는 발전량만 포함
      </p>
    </div>
  );
};
