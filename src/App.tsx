import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Calculator,
  FileSpreadsheet,
  Flame,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TrendingUp,
  Upload,
  Zap,
} from 'lucide-react';
import {
  AnalysisResult,
  DemandDataset,
  FuelGenerationDataset,
  SolarDataset,
  TARGET_FUELS,
  analyzeGridData,
  computeFuelAnnualHourlyAverages,
  computeSeasonalComparison,
  parseDemandCsv,
  parseGenerationByFuelCsv,
  parseSolarCsv,
  INVALID_FILE_ERROR_MESSAGE,
} from './utils/kpxParser';
import { DuckCurvePreviewChart } from './components/DuckCurvePreviewChart';
import { SeasonalComparisonView } from './components/SeasonalComparisonView';
import { RealCaseComparisonView } from './components/RealCaseComparisonView';
import { DuckCurveExplanationCard } from './components/DuckCurveExplanationCard';
import { TermTooltip } from './components/TermTooltip';

type TabKey = 'summary' | 'seasonal' | 'insights';

const HOURS = Array.from({ length: 24 }, (_, idx) => idx + 1);

function formatIntegerMwh(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

function formatDemandValidator(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString('ko-KR');
  }
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDecimalMwh(value: number): string {
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

  const [demandDataset, setDemandDataset] = useState<DemandDataset | null>(null);
  const [solarDataset, setSolarDataset] = useState<SolarDataset | null>(null);
  const [fuelDataset, setFuelDataset] = useState<FuelGenerationDataset | null>(null);

  const [demandError, setDemandError] = useState<string | null>(null);
  const [solarError, setSolarError] = useState<string | null>(null);
  const [fuelError, setFuelError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [isDraggingDemand, setIsDraggingDemand] = useState(false);
  const [isDraggingSolar, setIsDraggingSolar] = useState(false);
  const [isDraggingFuel, setIsDraggingFuel] = useState(false);

  const [isParsingDemand, setIsParsingDemand] = useState(false);
  const [isParsingSolar, setIsParsingSolar] = useState(false);
  const [isParsingFuel, setIsParsingFuel] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<number | ''>('');

  const [dayRange, setDayRange] = useState<[number, number]>([11, 15]);
  const [eveningRange, setEveningRange] = useState<[number, number]>([18, 20]);

  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const demandInputRef = useRef<HTMLInputElement | null>(null);
  const solarInputRef = useRef<HTMLInputElement | null>(null);
  const fuelInputRef = useRef<HTMLInputElement | null>(null);

  const analysis: AnalysisResult | null = useMemo(() => {
    if (!demandDataset || !solarDataset) {
      return null;
    }
    try {
      return analyzeGridData(demandDataset, solarDataset);
    } catch {
      return null;
    }
  }, [demandDataset, solarDataset]);

  const fuelAnnualAverages = useMemo(() => {
    if (!fuelDataset) return null;
    return computeFuelAnnualHourlyAverages(fuelDataset);
  }, [fuelDataset]);

  const handleDemandFile = async (file: File | undefined) => {
    if (!file) return;
    setIsParsingDemand(true);
    setDemandError(null);
    setAnalysisError(null);

    try {
      const parsed = await parseDemandCsv(file);
      setDemandDataset(parsed);
      setAiText(null);
      setAiError(null);

      if (solarDataset) {
        try {
          const result = analyzeGridData(parsed, solarDataset);
          setSelectedDate(result.minDemand.date);
          setSelectedHour(result.minDemand.hour);
        } catch (err) {
          setAnalysisError(
            err instanceof Error ? err.message : INVALID_FILE_ERROR_MESSAGE
          );
          setSelectedDate('');
          setSelectedHour('');
        }
      }
    } catch (err) {
      setDemandDataset(null);
      setDemandError(
        err instanceof Error ? err.message : INVALID_FILE_ERROR_MESSAGE
      );
      setSelectedDate('');
      setSelectedHour('');
    } finally {
      setIsParsingDemand(false);
    }
  };

  const handleSolarFile = async (file: File | undefined) => {
    if (!file) return;
    setIsParsingSolar(true);
    setSolarError(null);
    setAnalysisError(null);

    try {
      const parsed = await parseSolarCsv(file);
      setSolarDataset(parsed);
      setAiText(null);
      setAiError(null);

      if (demandDataset) {
        try {
          const result = analyzeGridData(demandDataset, parsed);
          setSelectedDate(result.minDemand.date);
          setSelectedHour(result.minDemand.hour);
        } catch (err) {
          setAnalysisError(
            err instanceof Error ? err.message : INVALID_FILE_ERROR_MESSAGE
          );
          setSelectedDate('');
          setSelectedHour('');
        }
      }
    } catch (err) {
      setSolarDataset(null);
      setSolarError(
        err instanceof Error ? err.message : INVALID_FILE_ERROR_MESSAGE
      );
      setSelectedDate('');
      setSelectedHour('');
    } finally {
      setIsParsingSolar(false);
    }
  };

  const handleFuelFile = async (file: File | undefined) => {
    if (!file) return;
    setIsParsingFuel(true);
    setFuelError(null);

    try {
      const parsed = await parseGenerationByFuelCsv(file);
      setFuelDataset(parsed);
      setAiText(null);
      setAiError(null);
    } catch (err) {
      setFuelDataset(null);
      setFuelError(
        err instanceof Error ? err.message : INVALID_FILE_ERROR_MESSAGE
      );
    } finally {
      setIsParsingFuel(false);
    }
  };

  const handleReset = () => {
    setDemandDataset(null);
    setSolarDataset(null);
    setFuelDataset(null);
    setDemandError(null);
    setSolarError(null);
    setFuelError(null);
    setAnalysisError(null);
    setSelectedDate('');
    setSelectedHour('');
    setDayRange([11, 15]);
    setEveningRange([18, 20]);
    setAiText(null);
    setAiError(null);
    setAiLoading(false);
    if (demandInputRef.current) demandInputRef.current.value = '';
    if (solarInputRef.current) solarInputRef.current.value = '';
    if (fuelInputRef.current) fuelInputRef.current.value = '';
  };

  const handleGenerateAi = async () => {
    if (!analysis || aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    const seasonal = computeSeasonalComparison(analysis, dayRange, eveningRange);
    const minDate = analysis.minDemand.date;
    const minHour = analysis.minDemand.hour;

    const minDemandFuels =
      fuelDataset?.points.get(`${minDate}|${minHour}`) ?? null;
    const day04Fuels = fuelDataset?.points.get(`${minDate}|4`) ?? null;
    const day19Fuels = fuelDataset?.points.get(`${minDate}|19`) ?? null;

    const payload = {
      dayRange,
      eveningRange,
      springDayMin: seasonal.spring
        ? {
            value: Math.round(seasonal.spring.daytimeMinNetLoad.value),
            hour: seasonal.spring.daytimeMinNetLoad.hour,
          }
        : null,
      autumnDayMin: seasonal.autumn
        ? {
            value: Math.round(seasonal.autumn.daytimeMinNetLoad.value),
            hour: seasonal.autumn.daytimeMinNetLoad.hour,
          }
        : null,
      springEveningRamp: seasonal.spring
        ? Math.round(seasonal.spring.eveningRamp)
        : null,
      autumnEveningRamp: seasonal.autumn
        ? Math.round(seasonal.autumn.eveningRamp)
        : null,
      minDemand: {
        value: Math.round(analysis.minDemand.demand),
        date: analysis.minDemand.date,
        dayOfWeek: analysis.minDemand.dayOfWeek,
        hour: analysis.minDemand.hour,
      },
      minNetLoad: {
        value: Math.round(analysis.minNetLoad.netLoad),
        date: analysis.minNetLoad.date,
        hour: analysis.minNetLoad.hour,
      },
      minDemandFuels: minDemandFuels
        ? {
            원자력:
              minDemandFuels.원자력 !== null
                ? Math.round(minDemandFuels.원자력)
                : null,
            유연탄:
              minDemandFuels.유연탄 !== null
                ? Math.round(minDemandFuels.유연탄)
                : null,
            LNG:
              minDemandFuels.LNG !== null ? Math.round(minDemandFuels.LNG) : null,
            양수:
              minDemandFuels.양수 !== null
                ? Math.round(minDemandFuels.양수)
                : null,
            태양광:
              minDemandFuels.태양광 !== null
                ? Math.round(minDemandFuels.태양광)
                : null,
            풍력:
              minDemandFuels.풍력 !== null
                ? Math.round(minDemandFuels.풍력)
                : null,
          }
        : null,
      minDemandDay04Fuels: day04Fuels
        ? {
            원자력:
              day04Fuels.원자력 !== null ? Math.round(day04Fuels.원자력) : null,
            유연탄:
              day04Fuels.유연탄 !== null ? Math.round(day04Fuels.유연탄) : null,
            LNG: day04Fuels.LNG !== null ? Math.round(day04Fuels.LNG) : null,
            양수: day04Fuels.양수 !== null ? Math.round(day04Fuels.양수) : null,
          }
        : null,
      minDemandDay19Fuels: day19Fuels
        ? {
            원자력:
              day19Fuels.원자력 !== null ? Math.round(day19Fuels.원자력) : null,
            유연탄:
              day19Fuels.유연탄 !== null ? Math.round(day19Fuels.유연탄) : null,
            LNG: day19Fuels.LNG !== null ? Math.round(day19Fuels.LNG) : null,
            양수: day19Fuels.양수 !== null ? Math.round(day19Fuels.양수) : null,
          }
        : null,
    };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => null)) as {
        text?: string;
        error?: string;
      } | null;

      if (!res.ok) {
        throw new Error(
          data?.error || `AI 해설 요청에 실패했습니다 (${res.status}).`
        );
      }
      if (!data?.text) {
        throw new Error('AI 해설 응답이 비어 있습니다. 다시 시도해 주세요.');
      }
      setAiText(data.text);
    } catch (err) {
      console.error('[AI 해설 오류]', err);
      const isTimeout =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isTimeout) {
        setAiError('응답 시간이 초과됐어요. 다시 시도해 주세요');
      } else {
        setAiError(
          err instanceof Error && err.message
            ? err.message
            : '잠시 후 다시 시도해 주세요'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setAiLoading(false);
    }
  };

  const selectedPoint = useMemo(() => {
    if (!analysis || !selectedDate || selectedHour === '') {
      return null;
    }
    return analysis.matchedMap.get(`${selectedDate}|${selectedHour}`) ?? null;
  }, [analysis, selectedDate, selectedHour]);

  const selectedFuelPoint = useMemo(() => {
    if (!fuelDataset || !selectedDate || selectedHour === '') {
      return null;
    }
    return fuelDataset.points.get(`${selectedDate}|${selectedHour}`) ?? null;
  }, [fuelDataset, selectedDate, selectedHour]);

  const minDemandFuelPoint = useMemo(() => {
    if (!analysis || !fuelDataset) return null;
    return (
      fuelDataset.points.get(
        `${analysis.minDemand.date}|${analysis.minDemand.hour}`
      ) ?? null
    );
  }, [analysis, fuelDataset]);

  const missingBothFiles = !demandDataset || !solarDataset;
  const activeErrorMessage = demandError || solarError || fuelError || analysisError;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Banner */}
      <header className="fixed top-0 inset-x-0 z-40 pt-safe bg-gradient-to-r from-white via-teal-50/60 to-sky-50/80 backdrop-blur-md border-b border-teal-100/80 shadow-xs">
        <div className="max-w-5xl mx-auto h-16 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white border border-teal-200/80 shadow-2xs flex items-center justify-center shrink-0">
              <Sun className="w-5 h-5 text-amber-500 fill-amber-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base text-slate-900 truncate tracking-tight">
                덕 커브 레이더
              </span>
              <span className="text-xs text-slate-600 truncate">
                2025년 공개 전력 데이터로 봄·가을 경부하 확인하기
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            aria-label="업로드 초기화"
            className="px-3.5 py-1.5 inline-flex items-center gap-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-teal-700 hover:bg-white/90 border border-slate-200 transition-all cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto pt-20 pb-24 px-4">
        {activeTab === 'summary' && (
          <div className="space-y-4 py-2">
            {/* Duck Curve Explanation Card */}
            <DuckCurveExplanationCard />

            {/* Title Context Banner */}
            <section className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-teal-600 shrink-0" />
                  <Sun className="w-4 h-4 text-sky-600 shrink-0" />
                  <h1 className="font-bold text-base text-slate-900">
                    전력수요 · 태양광 · 연료원별 데이터 요약
                  </h1>
                </div>
                <span className="text-xs text-slate-500 font-mono-num">
                  브라우저 내 직접 계산 · 서버 전송 없음
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                한국전력거래소 전력수요 및 태양광 발전량 CSV 파일을 올리면 순부하와 연중 최저 지표를 계산하며, 연료원별 발전량 CSV를 함께 올리면 전원별 추이를 확인할 수 있습니다.
              </p>
            </section>

            {/* Upload Guidance / Validation Message */}
            {activeErrorMessage ? (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-red-800 animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-xs font-medium">{activeErrorMessage}</span>
              </div>
            ) : missingBothFiles ? (
              <div
                role="status"
                className="bg-gradient-to-r from-teal-50/90 via-white to-sky-50/70 border border-teal-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-800 animate-fade-in"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-100/80 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-teal-900 block">
                      3단계로 간편하게 전력 데이터를 분석하세요
                    </span>
                    <span className="text-xs font-semibold text-slate-700 block mt-1 flex items-center gap-1.5 flex-wrap font-mono-num">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-800 shadow-2xs">
                        ① 파일 3개 올리기
                      </span>
                      <span>→</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-800 shadow-2xs">
                        ② 봄·가을 비교 보기
                      </span>
                      <span>→</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-800 shadow-2xs">
                        ③ AI 해설 받기
                      </span>
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-teal-700 font-medium bg-white/90 border border-teal-200 px-3 py-1.5 rounded-xl shadow-2xs whitespace-nowrap">
                  브라우저 내 안전한 직접 계산
                </span>
              </div>
            ) : null}

            {/* 3 CSV Upload Slots */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Demand CSV Upload Slot */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                    <span className="font-semibold text-sm text-slate-900">
                      전력수요 CSV
                    </span>
                  </div>
                  {demandDataset && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      완료
                    </span>
                  )}
                </div>

                <input
                  ref={demandInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  id="demand-csv-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    void handleDemandFile(file);
                    e.target.value = '';
                  }}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => demandInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      demandInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingDemand(true);
                  }}
                  onDragLeave={() => setIsDraggingDemand(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingDemand(false);
                    const file = e.dataTransfer.files?.[0];
                    void handleDemandFile(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isDraggingDemand
                      ? 'border-teal-500 bg-teal-50/60'
                      : demandError
                      ? 'border-red-300 bg-red-50/40'
                      : demandDataset
                      ? 'border-teal-300 bg-teal-50/30'
                      : 'border-slate-200 hover:border-teal-500/60 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-white flex items-center justify-center border border-slate-200 text-slate-500 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {isParsingDemand
                          ? '읽는 중...'
                          : demandDataset
                          ? demandDataset.fileName
                          : '파일을 선택해 주세요'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        날짜, 1시~24시 (.csv)
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-1 text-[11px] font-medium rounded bg-white border border-slate-300 text-slate-700 whitespace-nowrap">
                    선택
                  </span>
                </div>
              </div>

              {/* Solar Generation CSV Upload Slot */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-sky-600" />
                    <span className="font-semibold text-sm text-slate-900">
                      태양광 발전량 CSV
                    </span>
                  </div>
                  {solarDataset && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      완료
                    </span>
                  )}
                </div>

                <input
                  ref={solarInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  id="solar-csv-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    void handleSolarFile(file);
                    e.target.value = '';
                  }}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => solarInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      solarInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingSolar(true);
                  }}
                  onDragLeave={() => setIsDraggingSolar(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingSolar(false);
                    const file = e.dataTransfer.files?.[0];
                    void handleSolarFile(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isDraggingSolar
                      ? 'border-teal-500 bg-teal-50/60'
                      : solarError
                      ? 'border-red-300 bg-red-50/40'
                      : solarDataset
                      ? 'border-teal-300 bg-teal-50/30'
                      : 'border-slate-200 hover:border-teal-500/60 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-white flex items-center justify-center border border-slate-200 text-slate-500 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {isParsingSolar
                          ? '읽는 중...'
                          : solarDataset
                          ? solarDataset.fileName
                          : '파일을 선택해 주세요'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        거래일·지역·연료원 (.csv)
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-1 text-[11px] font-medium rounded bg-white border border-slate-300 text-slate-700 whitespace-nowrap">
                    선택
                  </span>
                </div>
              </div>

              {/* Fuel Generation CSV Upload Slot */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-sm text-slate-900">
                      연료원별 발전량 CSV
                    </span>
                  </div>
                  {fuelDataset ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      완료
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">선택</span>
                  )}
                </div>

                <input
                  ref={fuelInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  id="fuel-csv-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    void handleFuelFile(file);
                    e.target.value = '';
                  }}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fuelInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fuelInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFuel(true);
                  }}
                  onDragLeave={() => setIsDraggingFuel(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFuel(false);
                    const file = e.dataTransfer.files?.[0];
                    void handleFuelFile(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isDraggingFuel
                      ? 'border-teal-500 bg-teal-50/60'
                      : fuelError
                      ? 'border-red-300 bg-red-50/40'
                      : fuelDataset
                      ? 'border-teal-300 bg-teal-50/30'
                      : 'border-slate-200 hover:border-teal-500/60 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-white flex items-center justify-center border border-slate-200 text-slate-500 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {isParsingFuel
                          ? '읽는 중...'
                          : fuelDataset
                          ? fuelDataset.fileName
                          : '파일을 선택해 주세요'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        거래일자·연료원별 (.csv)
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-1 text-[11px] font-medium rounded bg-white border border-slate-300 text-slate-700 whitespace-nowrap">
                    선택
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Key Telemetry Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Card 1: Lowest Demand */}
              <div className="border-l-4 border-blue-500 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-in flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>연중 최저 수요</span>
                    </div>
                    <span className="text-[11px] text-slate-500">수요 기준</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <div className="text-xl sm:text-2xl font-bold font-mono-num text-blue-700 tracking-tight">
                      {analysis ? formatIntegerMwh(analysis.minDemand.demand) : '—'}{' '}
                      <span className="text-xs font-normal text-slate-500 font-sans">
                        MWh
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-semibold text-slate-800 font-mono-num">
                        {analysis
                          ? `${analysis.minDemand.date} (${analysis.minDemand.dayOfWeek})`
                          : '—'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {analysis ? `${analysis.minDemand.hour}시` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {analysis && fuelDataset && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono-num flex flex-wrap gap-x-2.5 gap-y-0.5">
                    <span>
                      원자력{' '}
                      {minDemandFuelPoint && minDemandFuelPoint.원자력 !== null
                        ? `${formatIntegerMwh(minDemandFuelPoint.원자력)} MWh`
                        : '—'}
                    </span>
                    <span>·</span>
                    <span>
                      유연탄{' '}
                      {minDemandFuelPoint && minDemandFuelPoint.유연탄 !== null
                        ? `${formatIntegerMwh(minDemandFuelPoint.유연탄)} MWh`
                        : '—'}
                    </span>
                    <span>·</span>
                    <span>
                      LNG{' '}
                      {minDemandFuelPoint && minDemandFuelPoint.LNG !== null
                        ? `${formatIntegerMwh(minDemandFuelPoint.LNG)} MWh`
                        : '—'}
                    </span>
                  </div>
                )}
              </div>

              {/* Card 2: Lowest Net Load */}
              <div className="border-l-4 border-orange-500 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-in flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-orange-700 font-medium">
                      <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                      <span>최저 순부하</span>
                      <TermTooltip
                        term="순부하"
                        definition="전체 전력수요에서 태양광 발전량을 뺀 값입니다. 원자력·석탄·LNG 같은 다른 발전기가 채워야 하는 양이에요."
                      />
                    </div>
                    <span className="text-[11px] text-orange-700 font-medium">
                      순부하 기준
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <div className="text-xl sm:text-2xl font-bold font-mono-num text-orange-600 tracking-tight">
                      {analysis ? formatIntegerMwh(analysis.minNetLoad.netLoad) : '—'}{' '}
                      <span className="text-xs font-normal text-slate-500 font-sans">
                        MWh
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-semibold text-slate-800 font-mono-num">
                        {analysis
                          ? `${analysis.minNetLoad.date} (${analysis.minNetLoad.dayOfWeek})`
                          : '—'}
                      </div>
                      <div className="text-xs text-orange-700/80 font-mono-num">
                        {analysis ? `${analysis.minNetLoad.hour}시` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Analysis Period */}
              <div className="border-l-4 border-teal-600 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-in flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-teal-700 font-medium">
                      <CalendarRange className="w-4 h-4 text-teal-600" />
                      <span>분석 기간</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono-num">
                      {analysis
                        ? `${analysis.matchedDateCount.toLocaleString('ko-KR')}일 · ${analysis.matchedPointCount.toLocaleString('ko-KR')}시간`
                        : '—'}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    <div className="text-base sm:text-lg font-bold text-slate-800 font-mono-num tracking-tight">
                      {analysis
                        ? `${analysis.periodStart} ~ ${analysis.periodEnd}`
                        : '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {analysis
                        ? `한쪽 파일에만 있는 시간대 ${analysis.excludedCount.toLocaleString('ko-KR')}개 제외`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart + Validator Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left (7 cols): 24h Multi-Line Chart */}
              <div className="lg:col-span-7">
                <DuckCurvePreviewChart
                  analysis={analysis}
                  fuelDataset={fuelDataset}
                  fuelAnnualAverages={fuelAnnualAverages}
                  selectedDate={selectedDate}
                />
              </div>

              {/* Right (5 cols): Single Point Data Validation Calculator */}
              <div className="lg:col-span-5 bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-teal-600" />
                    <h2 className="font-bold text-sm text-slate-900">
                      단일 시점 데이터 검산기
                    </h2>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    직접 날짜·시간 확인
                  </span>
                </div>

                {/* Date & Hour Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex flex-col">
                    <label
                      className="text-[11px] font-medium text-slate-500 mb-1"
                      htmlFor="calc-date"
                    >
                      기준 일자
                    </label>
                    {analysis ? (
                      <input
                        id="calc-date"
                        type="date"
                        min={analysis.periodStart}
                        max={analysis.periodEnd}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent font-mono-num text-sm font-semibold text-slate-800 outline-none w-full min-h-[28px]"
                      />
                    ) : (
                      <div
                        id="calc-date"
                        className="font-mono-num text-sm font-semibold text-slate-400 min-h-[28px] flex items-center"
                      >
                        —
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex flex-col">
                    <label
                      className="text-[11px] font-medium text-slate-500 mb-1"
                      htmlFor="calc-hour"
                    >
                      측정 시간대 (1시~24시)
                    </label>
                    <select
                      id="calc-hour"
                      disabled={!analysis}
                      value={selectedHour}
                      onChange={(e) =>
                        setSelectedHour(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      className="bg-transparent font-mono-num text-sm font-semibold text-slate-800 outline-none w-full min-h-[28px] disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {!analysis ? (
                        <option value="">—</option>
                      ) : (
                        HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h}시
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Primary 3-Split Calculated Metrics */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-[11px] text-slate-500 font-medium">
                      전력수요
                    </span>
                    <span
                      id="metric-demand"
                      className="text-sm sm:text-base font-bold text-slate-900 font-mono-num mt-1"
                    >
                      {selectedPoint
                        ? formatDemandValidator(selectedPoint.demand)
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      MWh
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center border-l border-slate-200 pl-2">
                    <span className="text-[11px] text-slate-500 font-medium">
                      전국 태양광
                    </span>
                    <span
                      id="metric-solar"
                      className="text-sm sm:text-base font-bold text-sky-700 font-mono-num mt-1"
                    >
                      {selectedPoint
                        ? formatDecimalMwh(selectedPoint.solar)
                        : '—'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      MWh
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center border-l border-slate-200 bg-orange-50/70 rounded py-1 pl-2 pr-1">
                    <span className="text-[11px] text-orange-800 font-semibold">
                      순부하
                    </span>
                    <span
                      id="metric-netload"
                      className="text-sm sm:text-base font-bold text-orange-600 font-mono-num mt-1"
                    >
                      {selectedPoint
                        ? formatDecimalMwh(selectedPoint.netLoad)
                        : '—'}
                    </span>
                    <span className="text-[10px] text-orange-600 mt-0.5">
                      MWh
                    </span>
                  </div>
                </div>

                {/* 6 Fuel Generation Metrics (when Fuel CSV is uploaded) */}
                {fuelDataset && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">
                        동일 시각 연료원별 발전량
                      </span>
                      <span>연료원별 파일 기준</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TARGET_FUELS.map((fuel) => {
                        const val = selectedFuelPoint
                          ? selectedFuelPoint[fuel]
                          : null;
                        return (
                          <div
                            key={fuel}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 flex flex-col"
                          >
                            <span className="text-[11px] text-slate-500 font-medium">
                              {fuel}
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono-num mt-0.5">
                              {val !== null
                                ? `${formatIntegerMwh(val)} MWh`
                                : '— MWh'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-0.5">
                  <span className="flex items-center gap-1">
                    순부하
                    <TermTooltip
                      term="순부하"
                      definition="전체 전력수요에서 태양광 발전량을 뺀 값입니다. 원자력·석탄·LNG 같은 다른 발전기가 채워야 하는 양이에요."
                    />{' '}
                    = 전력수요 − 전국 태양광
                  </span>
                  {analysis && !selectedPoint && selectedDate && (
                    <span className="text-amber-700">
                      선택한 날짜·시간은 한쪽 파일에만 있어 계산에서 제외되었습니다
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Public Data Footnote */}
            <footer className="px-1 pt-1">
              <p className="text-xs text-slate-400 leading-relaxed flex items-center flex-wrap gap-1">
                * 수요는 수요예측용 잠정자료
                <TermTooltip
                  term="잠정자료"
                  definition="확정 전 임시로 공개된 값이라 나중에 공식 통계와 조금 다를 수 있어요."
                />{' '}
                / 태양광·연료원별 발전량은 전력시장 거래분 기준
              </p>
            </footer>
          </div>
        )}

        {activeTab === 'seasonal' && (
          <SeasonalComparisonView
            analysis={analysis}
            dayRange={dayRange}
            eveningRange={eveningRange}
            onChangeDayRange={(next) => {
              setDayRange(next);
              setAiText(null);
              setAiError(null);
            }}
            onChangeEveningRange={(next) => {
              setEveningRange(next);
              setAiText(null);
              setAiError(null);
            }}
            onGoToSummary={() => setActiveTab('summary')}
            aiText={aiText}
            aiLoading={aiLoading}
            aiError={aiError}
            onGenerateAi={() => void handleGenerateAi()}
          />
        )}

        {activeTab === 'insights' && (
          <RealCaseComparisonView
            analysis={analysis}
            onGoToSummary={() => setActiveTab('summary')}
          />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav
        aria-label="주요 메뉴"
        className="fixed bottom-0 inset-x-0 z-40 pb-safe bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className="max-w-5xl mx-auto flex justify-around items-center h-16 px-4">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            aria-current={activeTab === 'summary' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-w-[80px] min-h-[44px] px-3 py-1.5 transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-teal-700 text-white font-bold rounded-2xl shadow-sm scale-105'
                : 'text-slate-400 hover:text-slate-700 font-medium rounded-2xl'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 whitespace-nowrap">데이터 요약</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seasonal')}
            aria-current={activeTab === 'seasonal' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-w-[80px] min-h-[44px] px-3 py-1.5 transition-all cursor-pointer ${
              activeTab === 'seasonal'
                ? 'bg-teal-700 text-white font-bold rounded-2xl shadow-sm scale-105'
                : 'text-slate-400 hover:text-slate-700 font-medium rounded-2xl'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 whitespace-nowrap">봄·가을 비교 + AI 해설</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            aria-current={activeTab === 'insights' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-w-[80px] min-h-[44px] px-3 py-1.5 transition-all cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-teal-700 text-white font-bold rounded-2xl shadow-sm scale-105'
                : 'text-slate-400 hover:text-slate-700 font-medium rounded-2xl'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[11px] mt-0.5 whitespace-nowrap">실제 사례</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
