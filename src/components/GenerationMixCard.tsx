import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';

interface DayItem {
  key: string;
  label: string;
  mwh: number;
  share: number;
}

interface DayData {
  tradeDate: string; // YYYY-MM-DD
  totalMwh: number;
  daily: DayItem[];
  hourly: Array<{ hour: number; totalMwh: number; items: DayItem[] }>;
  fetchedAt: string;
  stale?: boolean;
}

interface LiveItem {
  key: string;
  label: string;
  mw: number;
  share: number;
}

interface LiveData {
  baseDatetime: string | null;
  totalMw: number;
  marketDemandMw: number | null;
  items: LiveItem[];
  offMarket: { ppaMw: number | null; btmMw: number | null };
  pumpingMw: number;
  fetchedAt: string;
  stale?: boolean;
  limited?: boolean;
  retryAfterSec?: number;
}

// 도넛과 목록에 그릴 공통 모양
interface ViewItem {
  key: string;
  label: string;
  value: number;
  unit: 'MW' | 'MWh';
  share: number;
}

const COLORS: Record<string, string> = {
  nuclear: '#7c3aed',
  coal: '#475569',
  lng: '#f97316',
  solar: '#eab308',
  wind: '#0ea5e9',
  renew: '#22c55e',
  hydro: '#2563eb',
  oil: '#94a3b8',
};

const SIZE = 168;
const R = 62;
const STROKE = 28;
const C = 2 * Math.PI * R;

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 ${dow}요일`;
}

function daysAgo(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000);
  const t = Date.UTC(kstToday.getUTCFullYear(), kstToday.getUTCMonth(), kstToday.getUTCDate());
  return Math.max(0, Math.round((t - Date.UTC(y, m - 1, d)) / 86400000));
}

function hhmm(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

const num0 = (n: number) => Math.round(n).toLocaleString('ko-KR');

function Donut({ items }: { items: ViewItem[] }) {
  const top = items[0];
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="발전원별 비중 도넛 그래프">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            {items
              .filter((it) => it.share > 0)
              .map((it) => {
                const len = (it.share / 100) * C;
                const el = (
                  <circle
                    key={it.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={COLORS[it.key] ?? '#94a3b8'}
                    strokeWidth={STROKE}
                    strokeDasharray={`${Math.max(0, len - 1)} ${C - Math.max(0, len - 1)}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
          </g>
        </svg>
        {top && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-[11px] text-slate-500">가장 큰 몫</span>
            <span className="text-sm font-bold text-slate-900">{top.label}</span>
            <span className="text-lg font-bold text-teal-700 font-mono-num">{top.share.toFixed(0)}%</span>
          </div>
        )}
      </div>

      <ul className="w-full space-y-1.5">
        {items
          .filter((it) => it.share >= 0.05)
          .map((it) => (
            <li key={it.key} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[it.key] ?? '#94a3b8' }} />
              <span className="w-20 shrink-0 font-semibold text-slate-800">{it.label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, it.share)}%`, background: COLORS[it.key] ?? '#94a3b8' }} />
              </span>
              <span className="w-10 text-right font-mono-num font-semibold text-slate-900">{it.share.toFixed(0)}%</span>
              <span className="hidden sm:inline w-24 text-right font-mono-num text-slate-500">
                {num0(it.value)} {it.unit}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export const GenerationMixCard: React.FC = () => {
  const [live, setLive] = useState<LiveData | null>(null);
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [day, setDay] = useState<DayData | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const [source, setSource] = useState<'live' | 'day'>('live');
  const [mode, setMode] = useState<'day' | 'hour'>('day');
  const [hour, setHour] = useState(12);
  const [tick, setTick] = useState(() => Date.now());

  const loadLive = useCallback(async (manual = false) => {
    if (manual) setLiveLoading(true);
    try {
      const res = await fetch(manual ? '/api/generation-live?force=1' : '/api/generation-live');
      const body = (await res.json().catch(() => null)) as (LiveData & { error?: string; code?: string }) | null;
      if (!res.ok || !body || body.error || !Array.isArray(body.items)) {
        setLiveCode(body?.code ?? null);
        throw new Error(body?.error || `실시간 발전원을 가져오지 못했어요 (${res.status}).`);
      }
      setLive(body);
      setLiveError(null);
      setLiveCode(null);
      if (manual) {
        setNotice(
          body.retryAfterSec
            ? `방금 확인한 값이에요. ${body.retryAfterSec}초 뒤에 다시 눌러 주세요.`
            : body.stale
            ? '연결이 불안정해 이전 값을 보여 주고 있어요.'
            : '최신 값으로 갱신했어요.'
        );
        window.setTimeout(() => setNotice(null), 6000);
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : '실시간 발전원을 가져오지 못했어요.');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const loadDay = useCallback(async () => {
    setDayLoading(true);
    try {
      const res = await fetch('/api/generation-mix');
      const body = (await res.json().catch(() => null)) as (DayData & { error?: string }) | null;
      if (!res.ok || !body || body.error || !Array.isArray(body.daily)) {
        throw new Error(body?.error || `발전원 정보를 가져오지 못했어요 (${res.status}).`);
      }
      setDay(body);
      setDayError(null);
    } catch (err) {
      setDayError(err instanceof Error ? err.message : '발전원 정보를 가져오지 못했어요.');
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLive();
    void loadDay();
    // 실시간 값은 1분마다 확인한다 (서버가 5분 단위로 저장해 두므로 호출 한도에는 영향이 적다).
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLive();
    }, 60 * 1000);
    const tickId = window.setInterval(() => setTick(Date.now()), 30 * 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tickId);
    };
  }, [loadLive, loadDay]);

  // 실시간을 쓸 수 없으면(미신청 등) 확정 하루 보기로 자동 전환한다.
  const liveUnavailable = !live && (liveError !== null || liveCode !== null);
  const effectiveSource: 'live' | 'day' = liveUnavailable ? 'day' : source;

  const hourRow = day?.hourly.find((h) => h.hour === hour) ?? null;
  const dayItems: ViewItem[] = day
    ? (mode === 'hour' && hourRow ? hourRow.items : day.daily).map((i) => ({ key: i.key, label: i.label, value: i.mwh, unit: 'MWh', share: i.share }))
    : [];
  const dayTotal = day ? (mode === 'hour' && hourRow ? hourRow.totalMwh : day.totalMwh) : 0;
  const liveItems: ViewItem[] = live ? live.items.map((i) => ({ key: i.key, label: i.label, value: i.mw, unit: 'MW', share: i.share })) : [];

  const agoMin = live ? Math.max(0, Math.floor((tick - new Date(live.fetchedAt).getTime()) / 60000)) : null;
  const waiting = effectiveSource === 'live' ? !live && !liveError : !day && !dayError;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h3 className="font-bold text-sm text-slate-900">전기는 무엇으로 만들까?</h3>
        {effectiveSource === 'live' && live && (
          <button
            type="button"
            onClick={() => void loadLive(true)}
            disabled={liveLoading}
            aria-busy={liveLoading}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${liveLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* 보기 선택 */}
        {!liveUnavailable && (
          <div role="group" aria-label="데이터 종류" className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
            {(
              [
                ['live', '지금 (5분 단위)'],
                ['day', '확정된 지난 하루'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={effectiveSource === key}
                onClick={() => setSource(key)}
                className={`px-3.5 py-1.5 rounded-full cursor-pointer transition-colors ${
                  effectiveSource === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 지금 */}
        {effectiveSource === 'live' && live && (
          <>
            <p className="text-xs text-slate-700 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-500" />
                </span>
                LIVE
              </span>
              <b className="text-slate-900 font-mono-num">{hhmm(live.baseDatetime) ?? '—'} 기준</b>
              {agoMin !== null && <span className="text-slate-500">· {agoMin < 1 ? '방금 확인' : `${agoMin}분 전 확인`} · 1분마다 자동 확인</span>}
            </p>

            {notice && (
              <p role="status" aria-live="polite" className="px-3 py-2 rounded-xl border text-xs font-medium bg-sky-50 border-sky-200 text-sky-800">
                {notice}
              </p>
            )}

            <Donut items={liveItems} />

            <p className="text-[11px] text-slate-500 leading-snug">
              지금 발전한 전기 {num0(live.totalMw)} MW의 비중이에요 (한국전력거래소 5분 단위, 전력시장 거래분).
            </p>
            <p className="text-[11px] text-slate-400 leading-snug">
              {live.pumpingMw > 0 && <>양수발전이 물을 퍼 올리느라 쓰는 전기 약 {num0(live.pumpingMw)} MW는 비중에서 뺐어요. </>}
              {(live.offMarket.ppaMw !== null || live.offMarket.btmMw !== null) && (
                <>
                  전력시장 밖 추정치(직접구매계약 약 {live.offMarket.ppaMw !== null ? num0(live.offMarket.ppaMw) : '—'} MW, 자가소비 약{' '}
                  {live.offMarket.btmMw !== null ? num0(live.offMarket.btmMw) : '—'} MW)는 위 비중에 들어 있지 않아서, 실제 태양광은 이보다 더 많아요.
                </>
              )}
              {live.stale ? ' (연결이 불안정해 이전에 받은 값을 보여 줘요)' : ''}
            </p>
          </>
        )}

        {/* 확정된 지난 하루 */}
        {effectiveSource === 'day' && day && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-700">
                <b className="text-slate-900">{prettyDate(day.tradeDate)}</b>
                <span className="text-slate-500"> · 가장 최근 공개된 날 ({daysAgo(day.tradeDate)}일 전)</span>
              </p>
              <div role="group" aria-label="보기 방식" className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
                {(
                  [
                    ['day', '하루 전체'],
                    ['hour', '시간대별'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={mode === key}
                    onClick={() => setMode(key)}
                    className={`px-3 py-1 rounded-full cursor-pointer transition-colors ${mode === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'hour' && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  aria-label="시간 선택"
                  className="flex-1 accent-teal-700"
                />
                <span className="w-12 text-right text-sm font-bold text-teal-800 font-mono-num">{hour}시</span>
              </div>
            )}

            <Donut items={dayItems} />

            <p className="text-[11px] text-slate-500 leading-snug">
              {mode === 'hour' ? `${hour}시 한 시간 동안` : '하루 동안'} 전력시장에서 거래된 발전량 {num0(dayTotal)} MWh의 비중이에요.
            </p>
            <p className="text-[11px] text-slate-400 leading-snug">
              확정 거래 데이터는 한국전력거래소가 나중에 공개해서 공개된 가장 최근 하루예요. 이쪽은 태양광과 풍력이 ‘신재생·기타’로 묶여 있어요.
              {day.stale ? ' (연결이 불안정해 이전에 받은 값을 보여 줘요)' : ''}
            </p>
          </>
        )}

        {waiting && <div className="h-40 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />}

        {liveUnavailable && liveCode === 'NOT_APPLIED' && (
          <div role="status" className="flex items-start gap-2 p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs leading-relaxed">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              5분 단위 ‘지금’ 발전원은 ‘발전원별 발전량 현황조회_GW’ 활용신청이 필요해요. 신청 전이라 확정된 지난 하루를 보여 드려요.
            </p>
          </div>
        )}

        {effectiveSource === 'live' && liveError && !live && liveCode !== 'NOT_APPLIED' && (
          <div role="status" className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs">
            <p className="font-semibold">{liveError}</p>
            <button type="button" onClick={() => void loadLive(true)} className="mt-1.5 font-semibold underline cursor-pointer">
              다시 시도
            </button>
          </div>
        )}

        {effectiveSource === 'day' && dayError && !day && (
          <div role="status" className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs">
            <p className="font-semibold">{dayError}</p>
            <button type="button" onClick={() => void loadDay()} disabled={dayLoading} className="mt-1.5 font-semibold underline cursor-pointer">
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
