import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Info,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  AnalysisResult,
  FuelGenerationDataset,
  computeHourlyMinDemandStats,
  computeSeasonalComparison,
  getKoreanSeason,
  isSpringWeekend,
} from '../utils/kpxParser';

interface AiInsightsViewProps {
  analysis: AnalysisResult | null;
  fuelDataset: FuelGenerationDataset | null;
  dayRange: [number, number];
  eveningRange: [number, number];
  aiText: string | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAi: () => void;
  onGoToSummary: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, idx) => idx + 1);

export const AiInsightsView: React.FC<AiInsightsViewProps> = ({
  analysis,
  dayRange,
  eveningRange,
  aiText,
  aiLoading,
  aiError,
  onGenerateAi,
  onGoToSummary,
}) => {
  const [caseHourFilter, setCaseHourFilter] = useState<'all' | number>('all');

  const seasonal = useMemo(() => {
    if (!analysis) return null;
    return computeSeasonalComparison(analysis, dayRange, eveningRange);
  }, [analysis, dayRange, eveningRange]);

  const spring = seasonal?.spring ?? null;
  const autumn = seasonal?.autumn ?? null;

  const rampDiff =
    spring && autumn ? spring.eveningRamp - autumn.eveningRamp : null;

  const hourlyMinStats = useMemo(() => {
    if (!analysis) return null;
    return computeHourlyMinDemandStats(analysis);
  }, [analysis]);

  const springWeekendHourCount = useMemo(() => {
    if (!hourlyMinStats) return null;
    return hourlyMinStats.filter((item) => item.isSpringWeekend).length;
  }, [hourlyMinStats]);

  const selectedCaseTarget = useMemo(() => {
    if (!analysis) return null;
    if (caseHourFilter === 'all') {
      const pt = analysis.minDemand;
      return {
        point: pt,
        season: getKoreanSeason(pt.date),
        isMatch: isSpringWeekend(pt.date, pt.dayOfWeek),
      };
    }
    const found = hourlyMinStats?.find((h) => h.hour === caseHourFilter);
    if (!found || !found.point || !found.season) return null;
    return {
      point: found.point,
      season: found.season,
      isMatch: found.isSpringWeekend,
    };
  }, [analysis, caseHourFilter, hourlyMinStats]);

  return (
    <div className="space-y-4 py-2">
      {/* Guidance notice if files aren't uploaded */}
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

      {/* 3-Column Top Summary Metric Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">
            봄 낮 최저 순부하
          </span>
          <div className="flex items-baseline gap-1 mt-2 font-mono-num">
            <span className="text-lg font-bold text-slate-900">
              {spring
                ? Math.round(spring.daytimeMinNetLoad.value).toLocaleString(
                    'ko-KR'
                  )
                : '—'}
            </span>
            <span className="text-xs font-medium text-slate-400">MWh</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">
            가을 낮 최저 순부하
          </span>
          <div className="flex items-baseline gap-1 mt-2 font-mono-num">
            <span className="text-lg font-bold text-slate-900">
              {autumn
                ? Math.round(autumn.daytimeMinNetLoad.value).toLocaleString(
                    'ko-KR'
                  )
                : '—'}
            </span>
            <span className="text-xs font-medium text-slate-400">MWh</span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs font-medium text-slate-500">
            저녁 상승폭 차이(봄 빼기 가을)
          </span>
          <div className="flex items-baseline gap-1 mt-2 font-mono-num">
            <span className="text-lg font-bold text-teal-700">
              {rampDiff !== null
                ? Math.round(rampDiff).toLocaleString('ko-KR')
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
        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-xs transition-all cursor-pointer"
      >
        <Sparkles className="w-4 h-4" />
        <span>{aiLoading ? '해설 작성 중...' : 'AI 해설 받기'}</span>
      </button>

      {/* AI Narrative Card */}
      <section className="flex flex-col w-full rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-teal-50 text-teal-700">
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

      {/* Real-World Case Comparison Card */}
      <section className="flex flex-col w-full rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-teal-50 text-teal-700">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 truncate">
              실제 사례와 비교
            </h3>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
              selectedCaseTarget
                ? selectedCaseTarget.isMatch
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                : 'text-slate-500 bg-slate-100'
            }`}
          >
            {selectedCaseTarget
              ? selectedCaseTarget.isMatch
                ? '일치'
                : '다름'
              : '분석 대기'}
          </span>
        </div>

        <div className="flex flex-col p-4 space-y-4">
          {/* Question + Hour Dropdown */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">
                연중 최저 수요일이 봄철 주말인가?
              </p>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="case-hour-select"
                  className="text-xs font-medium text-slate-600 whitespace-nowrap"
                >
                  기준 시간
                </label>
                <select
                  id="case-hour-select"
                  value={caseHourFilter === 'all' ? 'all' : String(caseHourFilter)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCaseHourFilter(v === 'all' ? 'all' : Number(v));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 font-mono-num outline-none focus:border-teal-600 cursor-pointer"
                >
                  <option value="all">하루 전체</option>
                  {HOURS.map((h) => (
                    <option key={h} value={String(h)}>
                      {h}시
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Calculated Result Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <div className="p-2.5 rounded-md bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">판정</span>
                <span className="mt-0.5 block">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${
                      selectedCaseTarget
                        ? selectedCaseTarget.isMatch
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                        : 'text-slate-400'
                    }`}
                  >
                    {selectedCaseTarget
                      ? selectedCaseTarget.isMatch
                        ? '일치'
                        : '다름'
                      : '—'}
                  </span>
                </span>
              </div>

              <div className="p-2.5 rounded-md bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">날짜</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono-num mt-0.5 block">
                  {selectedCaseTarget ? selectedCaseTarget.point.date : '—'}
                </span>
              </div>

              <div className="p-2.5 rounded-md bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">요일</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">
                  {selectedCaseTarget
                    ? `${selectedCaseTarget.point.dayOfWeek}요일`
                    : '—'}
                </span>
              </div>

              <div className="p-2.5 rounded-md bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">계절</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">
                  {selectedCaseTarget ? selectedCaseTarget.season : '—'}
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 p-2.5 rounded-md bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">수요 값</span>
                <span className="text-xs sm:text-sm font-bold text-teal-700 font-mono-num mt-0.5 block">
                  {selectedCaseTarget
                    ? `${Math.round(selectedCaseTarget.point.demand).toLocaleString('ko-KR')} MWh`
                    : '— MWh'}
                </span>
              </div>
            </div>
          </div>

          {/* 24-Hour Strip Chart */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                시간대별(1시~24시) 연중 최저 수요 발생일
              </span>
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-orange-500 inline-block" />
                  봄철 주말
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-300 inline-block" />
                  그 외
                </span>
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {(hourlyMinStats ??
                HOURS.map((h) => ({
                  hour: h,
                  point: null,
                  season: null,
                  isSpringWeekend: false,
                }))
              ).map((cell) => {
                const isSelected = caseHourFilter === cell.hour;
                const shortDate = cell.point ? cell.point.date.slice(5) : '—';
                const cellBg = !cell.point
                  ? 'bg-slate-100 text-slate-400 border-slate-200'
                  : cell.isSpringWeekend
                  ? 'bg-orange-500 text-white border-orange-600'
                  : 'bg-slate-200 text-slate-700 border-slate-300';

                return (
                  <button
                    key={cell.hour}
                    type="button"
                    disabled={!cell.point}
                    onClick={() => setCaseHourFilter(cell.hour)}
                    title={
                      cell.point
                        ? `${cell.hour}시 최저 수요: ${cell.point.date} (${cell.point.dayOfWeek}요일, ${cell.season}) · ${Math.round(cell.point.demand).toLocaleString('ko-KR')} MWh`
                        : `${cell.hour}시`
                    }
                    className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-md border text-center transition-all font-mono-num ${cellBg} ${
                      isSelected ? 'ring-2 ring-teal-700 ring-offset-1' : ''
                    } ${cell.point ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                  >
                    <span className="text-[10px] font-bold leading-tight flex items-center justify-center gap-0.5">
                      {cell.hour}시
                      {cell.isSpringWeekend && (
                        <Sun className="w-2.5 h-2.5 text-amber-200 shrink-0 inline-block" />
                      )}
                    </span>
                    <span className="text-[10px] leading-tight mt-0.5 opacity-95">
                      {shortDate}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-semibold text-slate-800 pt-0.5">
              {springWeekendHourCount !== null
                ? `24개 시간대 중 ${springWeekendHourCount}개 시간대에서 연중 최저 수요일이 봄철 주말입니다`
                : '—'}
            </p>
          </div>

          {/* Government Benchmark vs App Result */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-700 leading-relaxed">
                정부 발표: 2022년 이후 연중 최저 전력수요는 봄철 주말에 발생 (이전에는 명절 연휴)
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-800 font-medium leading-relaxed font-mono-num">
                이 앱의 결과:{' '}
                {selectedCaseTarget
                  ? `${selectedCaseTarget.point.date}, ${selectedCaseTarget.point.dayOfWeek}요일`
                  : '—'}
              </p>
            </div>
          </div>

          <div className="pt-0.5">
            <p className="text-[11px] text-slate-400 leading-snug">
              출처: 산업통상자원부 보도자료 (2023.3.24)
            </p>
          </div>
        </div>
      </section>

      {/* Grounding & Honesty Guarantee Banner */}
      <footer className="flex items-center justify-center w-full px-3 py-3 rounded-lg bg-slate-100/80 border border-slate-200/70">
        <div className="flex items-center gap-1.5 text-slate-600">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
          <span className="text-xs font-medium tracking-tight">
            이 해설은 앱이 계산한 숫자만 사용했습니다
          </span>
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </div>
      </footer>
    </div>
  );
};
