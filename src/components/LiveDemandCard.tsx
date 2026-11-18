import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, KeyRound, RefreshCw } from 'lucide-react';
import { AnalysisResult } from '../utils/kpxParser';

interface LiveDemandData {
  baseDatetime: string | null;
  currentDemand: number | null;
  supplyCapacity: number | null;
  forecastPeak: number | null;
  supplyReserve: number | null;
  supplyReserveRate: number | null;
  operReserve: number | null;
  operReserveRate: number | null;
  fetchedAt: string;
  cached?: boolean;
  stale?: boolean;
  limited?: boolean;
  retryAfterSec?: number;
}

type Notice = { tone: 'ok' | 'info' | 'warn'; text: string };

interface LiveDemandCardProps {
  analysis: AnalysisResult | null;
}

// 서버가 15분 캐시를 두므로 화면은 5분마다 다시 물어봐도 API 트래픽은 늘지 않는다.
const REFRESH_MS = 5 * 60 * 1000;

function fmtMw(value: number | null): string {
  return value === null ? '—' : `${Math.round(value).toLocaleString('ko-KR')} MW`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LiveDemandCard: React.FC<LiveDemandCardProps> = ({ analysis }) => {
  const [data, setData] = useState<LiveDemandData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dataRef = useRef<LiveDemandData | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const showNotice = useCallback((next: Notice | null) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(next);
    if (next) {
      noticeTimer.current = window.setTimeout(() => setNotice(null), 8000);
    }
  }, []);

  // manual=true: 사용자가 새로고침 버튼을 누른 경우. 서버 캐시를 건너뛰고 결과를 안내한다.
  const load = useCallback(
    async (manual = false) => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 15000);
        let res: Response;
        try {
          res = await fetch(manual ? '/api/live-demand?force=1' : '/api/live-demand', {
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
        const body = (await res.json().catch(() => null)) as
          | (LiveDemandData & { error?: string; code?: string })
          | null;
        if (!res.ok || !body || body.error) {
          setNoKey(body?.code === 'NO_KEY');
          throw new Error(body?.error || `실시간 정보를 가져오지 못했습니다 (${res.status}).`);
        }

        const prev = dataRef.current;
        dataRef.current = body;
        setData(body);
        setError(null);
        setNoKey(false);

        if (body.stale) {
          showNotice({ tone: 'warn', text: '전력거래소에 연결하지 못해 이전 값을 보여 주고 있어요.' });
        } else if (body.limited) {
          showNotice({ tone: 'warn', text: '오늘 조회 한도에 도달해 마지막 값을 보여 줘요. 내일 다시 갱신돼요.' });
        } else if (manual && body.retryAfterSec) {
          showNotice({
            tone: 'info',
            text: `방금 확인한 값이에요. ${body.retryAfterSec}초 뒤에 다시 눌러 주세요.`,
          });
        } else if (manual && prev && prev.baseDatetime === body.baseDatetime) {
          showNotice({
            tone: 'info',
            text: '이미 가장 최신 값이에요. 전력거래소가 5분마다 새 값을 내놓아요.',
          });
        } else if (manual) {
          showNotice({ tone: 'ok', text: '최신 값으로 갱신했어요.' });
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        const message = aborted
          ? '응답이 늦어져서 중단했어요. 잠시 후 다시 시도해 주세요.'
          : err instanceof Error
          ? err.message
          : '실시간 정보를 가져오지 못했습니다.';
        setError(message);
        // 이미 보여 주던 값이 있으면 그대로 두고, 실패했다는 사실만 알린다.
        if (dataRef.current) showNotice({ tone: 'warn', text: `갱신 실패: ${message}` });
      } finally {
        setLoading(false);
      }
    },
    [showNotice]
  );

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(noticeTimer.current);
    };
  }, [load]);

  // 업로드 데이터의 연중 최저 수요(1시간 거래량 MWh = 그 시간 평균 MW)와 비교
  const minDemand = analysis?.minDemand ?? null;
  const ratio =
    data?.currentDemand && minDemand && minDemand.demand > 0
      ? data.currentDemand / minDemand.demand
      : null;

  const usageRate =
    data?.currentDemand && data.supplyCapacity
      ? Math.min(100, (data.currentDemand / data.supplyCapacity) * 100)
      : null;

  return (
    <section className="flex flex-col w-full rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 truncate">실시간 전력수요</h3>
          {data && !error && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-500" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="flex flex-col p-4 space-y-3">
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`px-3 py-2 rounded-xl border text-xs font-medium ${
              notice.tone === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : notice.tone === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-sky-50 border-sky-200 text-sky-800'
            }`}
          >
            {notice.text}
          </div>
        )}

        {error && !data && (
          <div
            role="status"
            className={`flex items-start gap-2 p-3 rounded-xl border text-xs leading-relaxed ${
              noKey
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {noKey && <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />}
            <div>
              <p className="font-semibold">{error}</p>
              {noKey && (
                <p className="mt-1">
                  공공데이터포털에서 &lsquo;한국전력거래소_현재전력수급현황조회_GW&rsquo;를 활용신청한 뒤, 발급받은
                  인증키를 <code className="font-mono-num">KPX_SERVICE_KEY</code>로 넣고 서버를 다시 시작하세요.
                </p>
              )}
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <span className="text-[11px] text-slate-500 block">현재 전력수요</span>
                <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono-num">
                  {fmtMw(data.currentDemand)}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono-num">
                기준 {fmtTime(data.baseDatetime)}
                {data.stale ? ' · 이전 값' : ''}
              </span>
            </div>

            {usageRate !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>공급능력 대비 사용</span>
                  <span className="font-mono-num">{usageRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-all"
                    style={{ width: `${usageRate}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">공급능력</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono-num mt-0.5 block">
                  {fmtMw(data.supplyCapacity)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">오늘 최대예측수요</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono-num mt-0.5 block">
                  {fmtMw(data.forecastPeak)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">공급예비력</span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono-num mt-0.5 block">
                  {fmtMw(data.supplyReserve)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">공급예비율</span>
                <span className="text-xs sm:text-sm font-bold text-teal-700 font-mono-num mt-0.5 block">
                  {data.supplyReserveRate === null ? '—' : `${data.supplyReserveRate.toFixed(1)}%`}
                </span>
              </div>
            </div>

            {ratio !== null && minDemand && (
              <p className="text-xs text-slate-700 leading-relaxed p-3 rounded-xl bg-teal-50/60 border border-teal-100">
                지금 수요는 업로드한 데이터의 연중 최저 수요(
                <span className="font-mono-num">
                  {minDemand.date} {minDemand.hour}시, {Math.round(minDemand.demand).toLocaleString('ko-KR')} MWh
                </span>
                )의 <span className="font-bold text-teal-800 font-mono-num">{(ratio * 100).toFixed(0)}%</span>{' '}
                수준입니다.
              </p>
            )}
          </>
        )}

        {!data && !error && (
          <p className="text-xs text-slate-500">실시간 정보를 불러오는 중…</p>
        )}

        <p className="text-[11px] text-slate-400 leading-snug">
          출처: 한국전력거래소 현재전력수급현황 (공공데이터포털, 5분 단위). 자동으로는 15분마다, 새로고침 버튼은 1분 간격으로 갱신합니다(공공데이터포털 하루 호출 한도 때문). 1시간
          거래량(MWh)은 그 시간의 평균 출력(MW)과 같아서 직접 비교할 수 있습니다.
        </p>
      </div>
    </section>
  );
};
