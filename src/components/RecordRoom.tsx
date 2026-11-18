import React, { useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ExternalLink, FileUp, Moon, Sun, Zap } from 'lucide-react';
import {
  AnalysisResult,
  DemandDataset,
  FuelGenerationDataset,
  FuelHourlyAverage,
  SolarDataset,
  TARGET_FUELS,
  getKoreanDayOfWeek,
} from '../utils/kpxParser';

interface RecordRoomProps {
  demand: DemandDataset | null;
  solar: SolarDataset | null;
  fuel: FuelGenerationDataset | null;
  analysis: AnalysisResult | null;
  fuelAverages: FuelHourlyAverage[] | null;
  errors: { demand: string | null; solar: string | null; fuel: string | null; analysis: string | null };
  parsing: { demand: boolean; solar: boolean; fuel: boolean };
  onDemandFile: (file: File | undefined) => void;
  onSolarFile: (file: File | undefined) => void;
  onFuelFile: (file: File | undefined) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// ── 색 ──────────────────────────────────────────────
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// 연한 민트 → 청록 → 진한 청록
function heat(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? mix([225, 247, 243], [94, 207, 190], x / 0.5) : mix([94, 207, 190], [13, 94, 88], (x - 0.5) / 0.5);
}

// ── 데이터 요약 ───────────────────────────────────────
interface DailyRow {
  date: string;
  avg: number;
  max: number;
}

interface Summary {
  daily: DailyRow[];
  dayCount: number;
  period: [string, string];
  overallAvg: number;
  min: { date: string; hour: number; value: number };
  max: { date: string; hour: number; value: number };
  minDay: DailyRow;
  maxDay: DailyRow;
  weekdayAvg: number;
  weekendAvg: number;
  hourAvg: number[]; // 길이 24
  dowHour: number[][]; // [요일 0~6][시 0~23]
  months: Array<{ key: string; avg: number }>;
}

function dowOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function summarize(points: Map<string, number>): Summary | null {
  if (points.size === 0) return null;
  const daily = new Map<string, { sum: number; count: number; max: number }>();
  const hourSum = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
  const dowHourSum = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, count: 0 })));
  const monthSum = new Map<string, { sum: number; count: number }>();
  let total = 0;
  let n = 0;
  let wdSum = 0;
  let wdN = 0;
  let weSum = 0;
  let weN = 0;
  let min: Summary['min'] | null = null;
  let max: Summary['max'] | null = null;

  for (const [key, value] of points) {
    const sep = key.indexOf('|');
    const date = key.slice(0, sep);
    const hour = Number(key.slice(sep + 1));
    if (!Number.isFinite(value) || hour < 1 || hour > 24) continue;
    const dow = dowOf(date);

    const d = daily.get(date) ?? { sum: 0, count: 0, max: -Infinity };
    d.sum += value;
    d.count++;
    d.max = Math.max(d.max, value);
    daily.set(date, d);

    hourSum[hour - 1].sum += value;
    hourSum[hour - 1].count++;
    dowHourSum[dow][hour - 1].sum += value;
    dowHourSum[dow][hour - 1].count++;

    const mk = date.slice(0, 7);
    const m = monthSum.get(mk) ?? { sum: 0, count: 0 };
    m.sum += value;
    m.count++;
    monthSum.set(mk, m);

    total += value;
    n++;
    if (dow === 0 || dow === 6) {
      weSum += value;
      weN++;
    } else {
      wdSum += value;
      wdN++;
    }
    if (!min || value < min.value) min = { date, hour, value };
    if (!max || value > max.value) max = { date, hour, value };
  }
  if (!min || !max || n === 0) return null;

  const rows: DailyRow[] = [...daily.entries()]
    .map(([date, d]) => ({ date, avg: d.sum / d.count, max: d.max }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const minDay = rows.reduce((a, b) => (b.avg < a.avg ? b : a));
  const maxDay = rows.reduce((a, b) => (b.avg > a.avg ? b : a));

  return {
    daily: rows,
    dayCount: rows.length,
    period: [rows[0].date, rows[rows.length - 1].date],
    overallAvg: total / n,
    min,
    max,
    minDay,
    maxDay,
    weekdayAvg: wdN ? wdSum / wdN : 0,
    weekendAvg: weN ? weSum / weN : 0,
    hourAvg: hourSum.map((h) => (h.count ? h.sum / h.count : 0)),
    dowHour: dowHourSum.map((row) => row.map((c) => (c.count ? c.sum / c.count : 0))),
    months: [...monthSum.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, m]) => ({ key, avg: m.sum / m.count })),
  };
}

function utcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function prettyDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 ${getKoreanDayOfWeek(date)}요일`;
}

// ── 파일 올리는 칸 ─────────────────────────────────────
interface SlotProps {
  title: string;
  badge: '필수' | '선택';
  hint: string;
  info: string | null;
  error: string | null;
  parsing: boolean;
  onFile: (file: File | undefined) => void;
  linkUrl?: string;
  linkLabel?: string;
}

const Slot: React.FC<SlotProps> = ({ title, badge, hint, info, error, parsing, onFile, linkUrl, linkLabel }) => {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col gap-2 p-4 rounded-2xl border-2 border-dashed transition-colors ${
        drag
          ? 'border-teal-500 bg-teal-50'
          : info
          ? 'border-teal-300 bg-teal-50/50'
          : 'border-slate-300 bg-white hover:border-teal-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
            badge === '필수' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      </div>

      {info ? (
        <p className="flex items-start gap-1.5 text-xs text-teal-800 font-medium leading-snug break-all">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" />
          {info}
        </p>
      ) : (
        <p className="text-xs text-slate-500 leading-snug">{parsing ? '읽는 중…' : hint}</p>
      )}

      {error && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5" />
          {info ? '다시 선택' : '파일 선택'}
        </button>
        {linkUrl && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-teal-700"
          >
            {linkLabel ?? '어디서 받나요?'} <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};

// ── 그래프들 ──────────────────────────────────────────
const CELL = 12;
const GAP = 3;

function CalendarHeat({ summary }: { summary: Summary }) {
  const model = useMemo(() => {
    const rows = summary.daily.slice(-371);
    const byDate = new Map(rows.map((r) => [r.date, r.avg]));
    const first = rows[0].date;
    const last = rows[rows.length - 1].date;
    const start = utcDate(first);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // 그 주 일요일부터
    const end = utcDate(last);
    const cols: Array<Array<{ date: string; avg: number | null } | null>> = [];
    const monthLabels: Array<string | null> = [];
    let prevMonth = -1;
    for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 7)) {
      const col: Array<{ date: string; avg: number | null } | null> = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(cur);
        day.setUTCDate(day.getUTCDate() + d);
        const iso = day.toISOString().slice(0, 10);
        // 데이터 기간 밖(첫 주의 앞부분, 마지막 주의 뒷부분)은 빈 칸으로 둔다.
        if (day > end || iso < first) {
          col.push(null);
          continue;
        }
        col.push({ date: iso, avg: byDate.get(iso) ?? null });
      }
      cols.push(col);
      const firstCell = col.find((c) => c !== null);
      const month = firstCell ? Number(firstCell.date.slice(5, 7)) : -1;
      monthLabels.push(month !== prevMonth && month !== -1 ? `${month}월` : null);
      if (month !== -1) prevMonth = month;
    }
    const vals = rows.map((r) => r.avg);
    return { cols, monthLabels, lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [summary]);

  const width = model.cols.length * (CELL + GAP);

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div style={{ width: width + 24 }} className="relative pl-6">
          <div className="relative h-4 mb-1" style={{ width }}>
            {model.monthLabels.map((m, i) =>
              m ? (
                <span key={i} className="absolute text-[10px] text-slate-500" style={{ left: i * (CELL + GAP) }}>
                  {m}
                </span>
              ) : null
            )}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            <div className="absolute left-0 flex flex-col text-[10px] text-slate-400" style={{ gap: GAP, top: 20 }}>
              {DOW.map((d, i) => (
                <span key={d} style={{ height: CELL, lineHeight: `${CELL}px`, visibility: i % 2 === 1 ? 'visible' : 'hidden' }}>
                  {d}
                </span>
              ))}
            </div>
            {model.cols.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap: GAP }}>
                {col.map((cell, ri) => {
                  if (!cell) return <span key={ri} style={{ width: CELL, height: CELL }} />;
                  const isMin = cell.date === summary.minDay.date;
                  const isMax = cell.date === summary.maxDay.date;
                  return (
                    <span
                      key={ri}
                      title={cell.avg === null ? `${prettyDate(cell.date)} · 기록 없음` : `${prettyDate(cell.date)} · 하루 평균 ${fmt(cell.avg)} MWh`}
                      className={`rounded-[3px] ${isMin ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${isMax ? 'ring-2 ring-rose-500 ring-offset-1' : ''}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        background:
                          cell.avg === null ? '#f1f5f9' : heat((cell.avg - model.lo) / Math.max(1, model.hi - model.lo)),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          적게
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="w-3 h-3 rounded-[3px]" style={{ background: heat(t) }} />
          ))}
          많이
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-[3px] ring-2 ring-amber-400" style={{ background: '#f1f5f9' }} /> 가장 한가한 날
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-[3px] ring-2 ring-rose-500" style={{ background: '#f1f5f9' }} /> 가장 바쁜 날
        </span>
      </div>
    </div>
  );
}

function WeekHourHeat({ summary }: { summary: Summary }) {
  const flat = summary.dowHour.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const order = [1, 2, 3, 4, 5, 6, 0]; // 월~일

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[520px]">
        <div className="grid" style={{ gridTemplateColumns: '24px repeat(24, minmax(0, 1fr))', gap: 2 }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-[9px] text-slate-400 text-center">
              {h % 3 === 0 ? h + 1 : ''}
            </span>
          ))}
          {order.map((dow) => (
            <React.Fragment key={dow}>
              <span className="text-[10px] text-slate-500 flex items-center">{DOW[dow]}</span>
              {summary.dowHour[dow].map((v, h) => (
                <span
                  key={h}
                  title={`${DOW[dow]}요일 ${h + 1}시 · 평균 ${fmt(v)} MWh`}
                  className="h-5 rounded-[3px]"
                  style={{ background: heat((v - lo) / Math.max(1, hi - lo)) }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthBars({ summary }: { summary: Summary }) {
  const hi = Math.max(...summary.months.map((m) => m.avg));
  const lo = Math.min(...summary.months.map((m) => m.avg));
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-40">
      {summary.months.map((m) => {
        // 달끼리 차이가 보이도록 가장 적게 쓴 달을 기준선으로 잡는다 (막대 길이가 실제 비율은 아니다).
        const pct = 22 + (78 * (m.avg - lo)) / Math.max(1, hi - lo);
        const isHi = m.avg === hi;
        const isLo = m.avg === lo;
        return (
          <div key={m.key} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
            <span className={`text-[10px] font-mono-num ${isHi ? 'text-rose-600 font-bold' : isLo ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
              {isHi || isLo ? fmt(m.avg / 1000) + 'k' : ''}
            </span>
            <div
              className="w-full rounded-t-lg"
              style={{
                height: `${pct}%`,
                background: isHi ? '#e11d48' : isLo ? '#f59e0b' : heat(0.3 + 0.7 * ((m.avg - lo) / Math.max(1, hi - lo))),
              }}
              title={`${m.key} · 평균 ${fmt(m.avg)} MWh`}
            />
            <span className="text-[10px] text-slate-500">{Number(m.key.slice(5, 7))}월</span>
          </div>
        );
      })}
    </div>
  );
}

const FUEL_COLOR: Record<string, string> = {
  원자력: '#7c3aed',
  유연탄: '#475569',
  LNG: '#f97316',
  양수: '#2563eb',
  태양광: '#eab308',
  풍력: '#0ea5e9',
};

function FuelDonut({ averages }: { averages: FuelHourlyAverage[] }) {
  const rows = TARGET_FUELS.map((f) => {
    const vals = averages.map((a) => a.values[f]).filter((v): v is number => v !== null);
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { name: f, avg: Math.max(0, avg) };
  });
  const total = rows.reduce((s, r) => s + r.avg, 0);
  if (total <= 0) return <p className="text-xs text-slate-500">연료원별 값을 계산하지 못했어요.</p>;
  const SIZE = 160;
  const R = 58;
  const STROKE = 26;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const sorted = [...rows].sort((a, b) => b.avg - a.avg);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="연료원별 평균 비중" className="shrink-0">
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {sorted.map((r) => {
            const len = (r.avg / total) * C;
            const el = (
              <circle
                key={r.name}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={FUEL_COLOR[r.name] ?? '#94a3b8'}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(0, len - 1)} ${C}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <ul className="w-full space-y-1.5">
        {sorted.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: FUEL_COLOR[r.name] ?? '#94a3b8' }} />
            <span className="w-14 font-semibold text-slate-800">{r.name}</span>
            <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${(r.avg / total) * 100}%`, background: FUEL_COLOR[r.name] ?? '#94a3b8' }} />
            </span>
            <span className="w-10 text-right font-mono-num font-semibold">{((r.avg / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 파일이 없을 때 모양만 보여 주는 흐릿한 달력 (실제 데이터가 아니다)
function GhostCalendar() {
  const weeks = 53;
  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex gap-[3px] opacity-60 overflow-hidden">
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, d) => {
              const season = 0.5 + 0.5 * Math.cos(((w - 4) / weeks) * 2 * Math.PI * 2); // 여름·겨울이 진한 모양
              const week = d === 0 || d === 6 ? -0.18 : 0.04;
              return <span key={d} className="rounded-[3px] shrink-0" style={{ width: CELL, height: CELL, background: heat(0.15 + 0.55 * season + week) }} />;
            })}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/55">
        <p className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600 shadow-xs text-center">
          예시 모양 · 파일을 올리면 우리나라의 진짜 1년으로 채워져요
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ icon, kicker, title }: { icon: React.ReactNode; kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 text-teal-700 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide text-teal-700">{kicker}</p>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-keep">{title}</h2>
      </div>
    </div>
  );
}

// ── 본체 ──────────────────────────────────────────────
export const RecordRoom: React.FC<RecordRoomProps> = ({
  demand,
  solar,
  fuel,
  analysis,
  fuelAverages,
  errors,
  parsing,
  onDemandFile,
  onSolarFile,
  onFuelFile,
}) => {
  const summary = useMemo(() => (demand ? summarize(demand.points) : null), [demand]);

  const hourPeak = summary ? summary.hourAvg.indexOf(Math.max(...summary.hourAvg)) + 1 : null;
  const hourLow = summary ? summary.hourAvg.indexOf(Math.min(...summary.hourAvg.filter((v) => v > 0))) + 1 : null;
  const weekendGap =
    summary && summary.weekdayAvg > 0 ? ((summary.weekdayAvg - summary.weekendAvg) / summary.weekdayAvg) * 100 : null;

  return (
    <div className="space-y-6 py-2 max-w-4xl mx-auto">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 text-white p-5 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-amber-300/15 blur-2xl" aria-hidden="true" />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-100">
            <CalendarDays className="w-4 h-4" />
            전기 기록실
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight break-keep">올해 우리나라 전기를 한 장으로</h1>
          <p className="mt-2 text-sm text-teal-50/90 leading-relaxed">
            한국전력거래소가 공개한 시간별 데이터를 올리면, 언제 가장 한가했고 언제 가장 바빴는지 기록으로 보여 줘요. 모든
            계산은 이 브라우저 안에서만 이뤄지고 파일은 어디로도 보내지지 않아요.
          </p>
          {summary && (
            <p className="mt-3 inline-flex px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-semibold font-mono-num">
              {summary.period[0]} ~ {summary.period[1]} · {summary.dayCount}일
            </p>
          )}
        </div>
      </section>

      <section aria-label="파일 올리기" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Slot
          title="전력수요"
          badge="필수"
          hint="날짜 · 1시~24시 열이 있는 시간별 전국 전력수요량 CSV를 끌어 놓거나 선택하세요."
          info={demand ? `${demand.fileName} · ${demand.rowCount}일` : null}
          error={errors.demand}
          parsing={parsing.demand}
          onFile={onDemandFile}
          linkUrl="https://www.data.go.kr/data/15065266/fileData.do"
          linkLabel="시간별 전국 전력수요량"
        />
        <Slot
          title="태양광 거래량"
          badge="선택"
          hint="거래일 · 거래시간 · 지역 · 연료원 열이 있는 연료원별 전력거래량 CSV. 올리면 ‘태양광을 뺀 전기’까지 볼 수 있어요."
          info={solar ? `${solar.fileName} · 태양광 ${solar.solarRows.toLocaleString('ko-KR')}행` : null}
          error={errors.solar}
          parsing={parsing.solar}
          onFile={onSolarFile}
          linkUrl="https://www.data.go.kr/data/15081098/fileData.do"
          linkLabel="연료원별 전력거래량"
        />
        <Slot
          title="연료원별 발전량"
          badge="선택"
          hint="거래일자 · 연료원별 · 설비용량 · 전력거래량 열이 있는 CSV. 올리면 올해 발전원 비중이 나와요."
          info={fuel ? `${fuel.fileName} · ${fuel.matchedFuelRows.toLocaleString('ko-KR')}행` : null}
          error={errors.fuel}
          parsing={parsing.fuel}
          onFile={onFuelFile}
        />
      </section>

      {errors.analysis && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {errors.analysis}
        </p>
      )}

      {!summary && (
        <section className="space-y-3">
          <GhostCalendar />
          <p className="text-xs text-slate-500 leading-relaxed">
            전력수요 파일 하나만 있어도 한 해 달력, 하루 리듬, 달별 변화가 나와요. 태양광·연료원 파일은 나중에 더해도 돼요.
          </p>
        </section>
      )}

      {summary && (
        <>
          {/* 한 줄 요약 */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                <Moon className="w-3.5 h-3.5" /> 가장 한가했던 순간
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 font-mono-num">{fmt(summary.min.value)} MWh</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {prettyDate(summary.min.date)} {summary.min.hour}시
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700">
                <Zap className="w-3.5 h-3.5" /> 가장 바빴던 순간
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 font-mono-num">{fmt(summary.max.value)} MWh</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {prettyDate(summary.max.date)} {summary.max.hour}시
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200">
              <p className="text-[11px] font-bold text-teal-700">한 시간 평균</p>
              <p className="mt-1 text-lg font-bold text-slate-900 font-mono-num">{fmt(summary.overallAvg)} MWh</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {weekendGap !== null && (weekendGap >= 0 ? `주말은 평일보다 약 ${weekendGap.toFixed(0)}% 적게 써요` : `주말이 평일보다 약 ${Math.abs(weekendGap).toFixed(0)}% 많아요`)}
              </p>
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
            <SectionTitle icon={<CalendarDays className="w-4.5 h-4.5" />} kicker="한 해 달력" title="언제 전기를 많이 썼을까?" />
            <p className="text-sm text-slate-700 leading-relaxed">
              한 칸이 하루예요. 진할수록 그날 전기를 많이 썼어요. 가장 한가했던 날은{' '}
              <b className="text-amber-700">{prettyDate(summary.minDay.date)}</b>, 가장 바빴던 날은{' '}
              <b className="text-rose-700">{prettyDate(summary.maxDay.date)}</b>이에요.
            </p>
            <CalendarHeat summary={summary} />
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
            <SectionTitle icon={<Sun className="w-4.5 h-4.5" />} kicker="하루 리듬" title="요일과 시간별로 보면?" />
            <p className="text-sm text-slate-700 leading-relaxed">
              {hourPeak !== null && hourLow !== null && (
                <>
                  하루 중에는 보통 <b className="text-rose-700">{hourPeak}시</b>쯤 가장 많이, <b className="text-amber-700">{hourLow}시</b>쯤
                  가장 적게 써요.{' '}
                </>
              )}
              주말 낮은 평일보다 확실히 옅어요.
            </p>
            <WeekHourHeat summary={summary} />
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
            <SectionTitle icon={<CalendarDays className="w-4.5 h-4.5" />} kicker="달별 변화" title="계절을 타는 전기" />
            <p className="text-sm text-slate-700 leading-relaxed">달마다 한 시간 평균 전기 사용량이에요. 차이가 잘 보이도록 가장 적게 쓴 달을 기준으로 막대를 그렸어요(길이가 실제 비율은 아니에요). 단위는 MWh, k는 천이에요.</p>
            <MonthBars summary={summary} />
          </section>

          {analysis && (
            <section className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
              <SectionTitle icon={<Sun className="w-4.5 h-4.5" />} kicker="태양광을 더하면" title="태양광이 만든 전기를 빼 봤어요" />
              <p className="text-sm text-slate-700 leading-relaxed">
                수요에서 태양광을 뺀 값(순부하)이 가장 낮았던 순간은 <b>{prettyDate(analysis.minNetLoad.date)} {analysis.minNetLoad.hour}시</b>예요.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500">그때 수요</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900 font-mono-num">{fmt(analysis.minNetLoad.demand)}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-[11px] text-amber-700">태양광</p>
                  <p className="mt-0.5 text-sm font-bold text-amber-900 font-mono-num">− {fmt(analysis.minNetLoad.solar)}</p>
                </div>
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <p className="text-[11px] text-teal-700">다른 발전소 몫</p>
                  <p className="mt-0.5 text-sm font-bold text-teal-900 font-mono-num">{fmt(analysis.minNetLoad.netLoad)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                단위 MWh. 전력시장에서 거래된 태양광만 포함해서 자가용·소규모 태양광은 일부만 반영돼요. 수요는 잠정자료예요.
              </p>
            </section>
          )}

          {!analysis && !solar && (
            <p className="text-xs text-slate-500 leading-relaxed p-3.5 rounded-xl bg-slate-100/70 border border-slate-200">
              태양광 거래량 파일을 올리면 ‘태양광이 만든 전기를 뺀 값’도 이 자리에서 볼 수 있어요.
            </p>
          )}

          {fuelAverages && (
            <section className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
              <SectionTitle icon={<Zap className="w-4.5 h-4.5" />} kicker="발전원" title="올해 전기는 무엇으로 만들었을까?" />
              <FuelDonut averages={fuelAverages} />
              <p className="text-[11px] text-slate-400 leading-snug">
                올린 파일의 시간별 평균을 합친 비중이에요. 양수는 물을 퍼 올릴 때 마이너스가 될 수 있어 0 이상만 셌어요.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
};
