import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface FuelNumbersPayload {
  원자력: number | null;
  유연탄: number | null;
  LNG: number | null;
  양수: number | null;
  태양광?: number | null;
  풍력?: number | null;
}

interface AiInsightsPayload {
  dayRange: [number, number];
  eveningRange: [number, number];
  springDayMin: { value: number; hour: number } | null;
  autumnDayMin: { value: number; hour: number } | null;
  springEveningRamp: number | null;
  autumnEveningRamp: number | null;
  minDemand: {
    value: number;
    date: string;
    dayOfWeek: string;
    hour: number;
  };
  minNetLoad: {
    value: number;
    date: string;
    hour: number;
  };
  minDemandFuels: FuelNumbersPayload | null;
  minDemandDay04Fuels: FuelNumbersPayload | null;
  minDemandDay19Fuels: FuelNumbersPayload | null;
}

const SYSTEM_INSTRUCTION =
  "너는 전력 데이터를 쉽게 설명하는 해설자야. 아래 숫자만 사용해서 봄과 가을의 덕 커브 차이와 연중 최저 수요일에 발전원별 출력이 어떻게 달라졌는지 일반인이 이해하기 쉽게 5문장에서 7문장으로 설명해. 주어진 숫자 외에 새로운 숫자를 만들지 마. 출력 변화의 원인은 단정하지 말고 '~로 보입니다'처럼 표현해. 마지막 문장에는 이 데이터가 전력시장 거래분 기준이고 수요는 잠정자료라는 한계를 언급해.";

function fmtMwh(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '데이터 없음';
  }
  return `${Math.round(val).toLocaleString('ko-KR')} MWh`;
}

function formatCalculatedSummaryPrompt(p: AiInsightsPayload): string {
  const lines: string[] = [
    '[계산된 숫자 요약]',
    `낮 구간: ${p.dayRange[0]}시~${p.dayRange[1]}시`,
    `저녁 구간: ${p.eveningRange[0]}시~${p.eveningRange[1]}시`,
    `봄 낮 최저 순부하: ${p.springDayMin ? `${fmtMwh(p.springDayMin.value)} (${p.springDayMin.hour}시)` : '데이터 없음'}`,
    `가을 낮 최저 순부하: ${p.autumnDayMin ? `${fmtMwh(p.autumnDayMin.value)} (${p.autumnDayMin.hour}시)` : '데이터 없음'}`,
    `봄 저녁 상승폭: ${fmtMwh(p.springEveningRamp)}`,
    `가을 저녁 상승폭: ${fmtMwh(p.autumnEveningRamp)}`,
    `연중 최저 수요: ${fmtMwh(p.minDemand.value)} (${p.minDemand.date} ${p.minDemand.dayOfWeek}요일 ${p.minDemand.hour}시)`,
    `최저 순부하: ${fmtMwh(p.minNetLoad.value)} (${p.minNetLoad.date} ${p.minNetLoad.hour}시)`,
  ];

  if (p.minDemandFuels) {
    lines.push(
      `연중 최저 수요 시각 발전량: 원자력 ${fmtMwh(p.minDemandFuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandFuels.유연탄)}, LNG ${fmtMwh(p.minDemandFuels.LNG)}, 양수 ${fmtMwh(p.minDemandFuels.양수)}, 태양광 ${fmtMwh(p.minDemandFuels.태양광)}, 풍력 ${fmtMwh(p.minDemandFuels.풍력)}`
    );
  } else {
    lines.push('연중 최저 수요 시각 발전량: 연료원별 파일 미업로드');
  }

  if (p.minDemandDay04Fuels) {
    lines.push(
      `같은 날 4시 발전량: 원자력 ${fmtMwh(p.minDemandDay04Fuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandDay04Fuels.유연탄)}, LNG ${fmtMwh(p.minDemandDay04Fuels.LNG)}, 양수 ${fmtMwh(p.minDemandDay04Fuels.양수)}`
    );
  } else {
    lines.push('같은 날 4시 발전량: 데이터 없음');
  }

  if (p.minDemandDay19Fuels) {
    lines.push(
      `같은 날 19시 발전량: 원자력 ${fmtMwh(p.minDemandDay19Fuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandDay19Fuels.유연탄)}, LNG ${fmtMwh(p.minDemandDay19Fuels.LNG)}, 양수 ${fmtMwh(p.minDemandDay19Fuels.양수)}`
    );
  } else {
    lines.push('같은 날 19시 발전량: 데이터 없음');
  }

  return lines.join('\n');
}

function extractShortError(err: unknown): { status: number; message: string } {
  const errObj = err as { status?: number; message?: string; name?: string } | null;
  if (errObj?.name === 'AbortError' || errObj?.name === 'TimeoutError') {
    return { status: 504, message: '응답 시간이 초과됐어요. 다시 시도해 주세요' };
  }

  const rawMsg = errObj?.message ?? String(err ?? 'Unknown error');
  const status = typeof errObj?.status === 'number' ? errObj.status : 500;

  if (status === 401 || status === 403 || rawMsg.includes('API_KEY') || rawMsg.includes('PERMISSION_DENIED')) {
    return { status: 403, message: 'API 키 또는 권한 오류가 발생했습니다 (403).' };
  }
  if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return { status: 429, message: '요청 한도를 초과했습니다 (429). 잠시 후 다시 시도해 주세요.' };
  }
  if (status === 404 || rawMsg.includes('NOT_FOUND')) {
    return { status: 404, message: 'AI 모델을 찾을 수 없습니다 (404).' };
  }
  if (status === 503 || rawMsg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'AI 서버 요청이 많아 일시적으로 응답이 어렵습니다 (503). 잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: `AI 해설 생성 중 오류가 발생했습니다 (${status}).`,
  };
}

function isRetryableGeminiError(err: unknown): boolean {
  const errObj = err as { status?: number; message?: string; name?: string } | null;
  if (!errObj) return false;
  if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') return false;
  const status = errObj.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = errObj.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
}

// ---------------------------------------------------------------------------
// 실시간 전력수급 (한국전력거래소_현재전력수급현황조회_GW, 공공데이터포털)
// https://www.data.go.kr/data/15158704/openapi.do
// ---------------------------------------------------------------------------

const KPX_LIVE_URL =
  'https://apis.data.go.kr/B552115/sukub5mMaxDatetime2/getSukub5mMaxDatetime2';

// 개발계정 트래픽이 하루 100건이라 서버에서 응답을 캐시한다 (기본 15분 → 하루 최대 96건).
const LIVE_CACHE_MS =
  (Number(process.env.LIVE_DEMAND_CACHE_SEC) || 15 * 60) * 1000;

export interface LiveDemandSnapshot {
  baseDatetime: string | null; // ISO 형식 (KST), 예: 2026-11-18T14:35:00+09:00
  currentDemand: number | null; // 현재수요 (MW)
  supplyCapacity: number | null; // 공급능력 (MW)
  forecastPeak: number | null; // 최대예측수요 (MW)
  supplyReserve: number | null; // 공급예비력 (MW)
  supplyReserveRate: number | null; // 공급예비율 (%)
  operReserve: number | null; // 운영예비력 (MW)
  operReserveRate: number | null; // 운영예비율 (%)
}

let liveCache: { at: number; data: LiveDemandSnapshot } | null = null;

// 사용자가 새로고침을 눌렀을 때는 캐시를 건너뛰되, 같은 값을 연달아 요청하지 않도록
// 최소 간격을 두고, 하루 호출 한도(개발계정 100건)를 넘기지 않도록 센다.
const FORCE_MIN_INTERVAL_MS = 60 * 1000;
const DAILY_CALL_LIMIT = Number(process.env.LIVE_DEMAND_DAILY_LIMIT) || 95;
const callCounters = new Map<string, { day: string; count: number }>();

function kstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// API마다 하루 한도가 따로라서 이름(bucket)별로 센다.
function reserveApiCall(bucket = 'live'): boolean {
  const today = kstDay();
  const entry = callCounters.get(bucket);
  if (!entry || entry.day !== today) {
    callCounters.set(bucket, { day: today, count: 1 });
    return true;
  }
  if (entry.count >= DAILY_CALL_LIMIT) return false;
  entry.count++;
  return true;
}

function pickNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = item[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function toIsoKst(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 12) return null;
  const [y, mo, d, h, mi] = [
    digits.slice(0, 4),
    digits.slice(4, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
    digits.slice(10, 12),
  ];
  const s = digits.length >= 14 ? digits.slice(12, 14) : '00';
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

function extractLiveItem(bodyText: string): Record<string, unknown> | null {
  const trimmed = bodyText.trim();
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed);
    const header = json?.response?.header ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    const code = header?.resultCode ?? header?.returnReasonCode;
    if (code !== undefined && String(code) !== '00' && String(code) !== '0') {
      throw new Error(`KPX API 오류: ${header?.resultMsg ?? header?.returnAuthMsg ?? code}`);
    }
    let item = json?.response?.body?.items?.item ?? json?.response?.body?.items;
    if (Array.isArray(item)) item = item[0];
    return item && typeof item === 'object' ? item : null;
  }

  // XML 응답 처리 (dataType 파라미터가 무시되는 경우 대비)
  const errMsg = /<(?:resultMsg|returnAuthMsg)>([^<]*)</.exec(trimmed)?.[1];
  const code = /<(?:resultCode|returnReasonCode)>([^<]*)</.exec(trimmed)?.[1];
  if (code && code !== '00' && code !== '0') {
    throw new Error(`KPX API 오류: ${errMsg ?? code}`);
  }
  const itemXml = /<item>([\s\S]*?)<\/item>/.exec(trimmed)?.[1];
  if (!itemXml) return null;
  const item: Record<string, string> = {};
  for (const m of itemXml.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
    item[m[1]] = m[2];
  }
  return item;
}

export function parseLiveDemand(bodyText: string): LiveDemandSnapshot | null {
  const item = extractLiveItem(bodyText);
  if (!item) return null;
  return {
    baseDatetime: toIsoKst(item.baseDatetime ?? item.baseDt ?? item.baseDateTime),
    currentDemand: pickNumber(item, ['currPwrTot', 'curPwrTot', 'currPwr', 'currLoad']),
    supplyCapacity: pickNumber(item, ['suppAbility', 'suppAblty', 'supplyAbility']),
    forecastPeak: pickNumber(item, ['forecastLoad', 'fcstLoad', 'maxFcstLoad']),
    supplyReserve: pickNumber(item, ['suppReservePwr', 'suppRsrvPwr']),
    supplyReserveRate: pickNumber(item, ['suppReserveRate', 'suppRsrvRate']),
    operReserve: pickNumber(item, ['operReservePwr', 'operRsrvPwr']),
    operReserveRate: pickNumber(item, ['operReserveRate', 'operRsrvRate']),
  };
}

async function fetchLiveDemand(serviceKey: string): Promise<LiveDemandSnapshot> {
  // 공공데이터포털 키는 Encoding/Decoding 두 형태가 있어, 이미 인코딩된 키는 그대로 쓴다.
  const encodedKey = /%[0-9A-Fa-f]{2}/.test(serviceKey)
    ? serviceKey
    : encodeURIComponent(serviceKey);
  const url = `${KPX_LIVE_URL}?serviceKey=${encodedKey}&pageNo=1&numOfRows=1&dataType=JSON`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  if (!res.ok) {
    // 오류 응답 본문에 사유(예: 등록되지 않은 서비스키)가 담겨 오면 그 메시지를 쓴다.
    let reason: string | null = null;
    try {
      extractLiveItem(text);
    } catch (e) {
      if ((e as Error).message.startsWith('KPX API 오류')) reason = (e as Error).message;
    }
    throw new Error(reason ?? `KPX API 요청 실패 (${res.status})`);
  }
  const data = parseLiveDemand(text);
  if (!data || data.currentDemand === null) {
    throw new Error('KPX API 응답에서 현재수요 값을 찾지 못했습니다.');
  }
  return data;
}

// ---------------------------------------------------------------------------
// 발전원별 발전량 (공공데이터포털 ‘한국전력거래소_발전원별 발전량’, End Point B552115/PvAmountByPwrGen)
// 하루 192행 = 발전원 8종 × 거래시간 24시간. amgo는 그 시간의 거래 발전량(MWh).
// 확정 거래 데이터가 늦게 공개되므로 실시간이 아니라 ‘가장 최근 공개된 하루’를 보여 준다.
// ---------------------------------------------------------------------------

const KPX_MIX_URL =
  process.env.KPX_MIX_URL || 'https://apis.data.go.kr/B552115/PvAmountByPwrGen/getPvAmountByPwrGen';
const MIX_CACHE_MS = 6 * 60 * 60 * 1000;

export interface MixItem {
  key: string;
  label: string;
  mwh: number;
  share: number; // 0~100
}

export interface GenerationMix {
  /** YYYY-MM-DD (가장 최근 공개된 거래일) */
  tradeDate: string;
  totalMwh: number;
  daily: MixItem[];
  /** 1~24시 */
  hourly: Array<{ hour: number; totalMwh: number; items: MixItem[] }>;
}

// fuelTpCd(연료원 이름) → 화면에 보여 줄 묶음
const MIX_GROUPS: Array<{ key: string; label: string; codes: string[] }> = [
  { key: 'nuclear', label: '원자력', codes: ['원자력'] },
  { key: 'coal', label: '석탄', codes: ['유연탄', '무연탄'] },
  { key: 'lng', label: 'LNG(가스)', codes: ['LNG'] },
  { key: 'renew', label: '신재생·기타', codes: ['신재생·기타'] }, // 태양광·풍력이 한 묶음으로 온다
  { key: 'hydro', label: '수력·양수', codes: ['수력', '양수'] },
  { key: 'oil', label: '유류', codes: ['유전'] },
];

function mixItems(sums: Map<string, number>): { items: MixItem[]; total: number } {
  const rows = MIX_GROUPS.map((g) => {
    const mwh = g.codes.reduce((sum, c) => sum + (sums.get(c) ?? 0), 0);
    // 양수(물을 퍼 올리는 시간)처럼 음수가 될 수 있는 값은 발전 비중에서 제외한다.
    return { key: g.key, label: g.label, mwh: Math.max(0, mwh) };
  });
  const total = rows.reduce((sum, r) => sum + r.mwh, 0);
  const items = rows
    .map((r) => ({ ...r, share: total > 0 ? (r.mwh / total) * 100 : 0 }))
    .sort((x, y) => y.mwh - x.mwh);
  return { items, total };
}

function kpxHeaderCheck(json: unknown): void {
  const j = json as {
    response?: { header?: { resultCode?: string; resultMsg?: string } };
    OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string } };
  };
  const header = j?.response?.header ?? j?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  const h = header as { resultCode?: string; resultMsg?: string; returnReasonCode?: string; returnAuthMsg?: string } | undefined;
  const code = h?.resultCode ?? h?.returnReasonCode;
  if (code !== undefined && String(code) !== '00' && String(code) !== '0') {
    const err = new Error('KPX API 오류: ' + (h?.resultMsg ?? h?.returnAuthMsg ?? code));
    (err as Error & { kpxCode?: string }).kpxCode = String(code);
    throw err;
  }
}

interface MixRow {
  tradeNo: string;
  fuelTpCd: string;
  tradeYmd: string;
  amgo: number;
}

function rowsOf(json: unknown): MixRow[] {
  const j = json as { response?: { body?: { items?: { item?: unknown } | string } } };
  let items: unknown = j?.response?.body?.items;
  if (items && typeof items === 'object' && 'item' in (items as object)) items = (items as { item?: unknown }).item;
  if (!items || typeof items === 'string') return [];
  const list = Array.isArray(items) ? items : [items];
  return (list as Array<Record<string, unknown>>)
    .map((r) => ({
      tradeNo: String(r.tradeNo ?? ''),
      fuelTpCd: String(r.fuelTpCd ?? ''),
      tradeYmd: String(r.tradeYmd ?? ''),
      amgo: Number(r.amgo),
    }))
    .filter((r) => r.tradeYmd && r.fuelTpCd && Number.isFinite(r.amgo));
}

export function parseGenerationMix(rows: MixRow[]): GenerationMix | null {
  if (rows.length === 0) return null;
  const ymd = rows[0].tradeYmd;
  const day = rows.filter((r) => r.tradeYmd === ymd);
  const daySums = new Map<string, number>();
  const byHour = new Map<number, Map<string, number>>();
  for (const r of day) {
    daySums.set(r.fuelTpCd, (daySums.get(r.fuelTpCd) ?? 0) + r.amgo);
    const hour = Number(r.tradeNo);
    if (!Number.isInteger(hour) || hour < 1 || hour > 24) continue;
    const m = byHour.get(hour) ?? new Map<string, number>();
    m.set(r.fuelTpCd, (m.get(r.fuelTpCd) ?? 0) + r.amgo);
    byHour.set(hour, m);
  }
  const daily = mixItems(daySums);
  if (daily.total <= 0) return null;
  const hourly = [...byHour.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([hour, sums]) => {
      const m = mixItems(sums);
      return { hour, totalMwh: m.total, items: m.items };
    });
  return {
    tradeDate: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8),
    totalMwh: daily.total,
    daily: daily.items,
    hourly,
  };
}

async function kpxGet(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('발전원 응답을 해석하지 못했습니다.');
  }
  kpxHeaderCheck(json);
  if (!res.ok) throw new Error('KPX API 요청 실패 (' + res.status + ')');
  return json;
}

async function fetchGenerationMix(serviceKey: string): Promise<GenerationMix> {
  const key = /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
  const base = KPX_MIX_URL + '?serviceKey=' + key + '&dataType=JSON&pageNo=1';
  // 1) 날짜를 주지 않으면 가장 최근 거래일부터 내려온다. 첫 행의 날짜가 공개된 가장 최근 날짜다.
  const latest = rowsOf(await kpxGet(base + '&numOfRows=1'));
  if (latest.length === 0) throw new Error('공개된 발전원 데이터를 찾지 못했습니다.');
  // 2) 그 날의 24시간 × 발전원 전체를 받는다 (하루 192행).
  const dayRows = rowsOf(await kpxGet(base + '&numOfRows=400&tradeYmd=' + latest[0].tradeYmd));
  const parsed = parseGenerationMix(dayRows);
  if (!parsed) throw new Error('발전원별 발전량 값을 찾지 못했습니다.');
  return parsed;
}

let mixCache: { at: number; data: GenerationMix } | null = null;

// ---------------------------------------------------------------------------
// 실시간 발전원 (공공데이터포털 ‘한국전력거래소_발전원별 발전량 현황조회_GW’, End Point B552115/sumperfuel5m)
// 5분마다 갱신되는 최신 한 시점만 온다. fuelPwr1~10(MW)의 합이 시장수요(fuelPwrTot)와 같다.
// ---------------------------------------------------------------------------

const KPX_LIVE_MIX_URL =
  process.env.KPX_LIVE_MIX_URL || 'https://apis.data.go.kr/B552115/sumperfuel5m/getSumperfuel5m';

export interface LiveMixItem {
  key: string;
  label: string;
  mw: number;
  share: number; // 0~100
}

export interface LiveMix {
  baseDatetime: string | null; // ISO(KST)
  totalMw: number; // 발전한 전기의 합 (양수만)
  marketDemandMw: number | null; // 응답의 시장수요(현재)
  items: LiveMixItem[];
  /** 전력시장 밖 추정치 (위 비중에는 들어 있지 않다) */
  offMarket: { ppaMw: number | null; btmMw: number | null };
  /** 양수(물을 퍼 올림)처럼 음수여서 비중에서 뺀 양 (MW) */
  pumpingMw: number;
}

// fuelPwr1~10의 의미는 공공데이터포털 상세 설명 기준이다.
const LIVE_GROUPS: Array<{ key: string; label: string; fields: string[] }> = [
  { key: 'nuclear', label: '원자력', fields: ['fuelPwr4'] },
  { key: 'coal', label: '석탄', fields: ['fuelPwr3', 'fuelPwr7'] }, // 유연탄 + 국내탄
  { key: 'lng', label: 'LNG(가스)', fields: ['fuelPwr6'] },
  { key: 'solar', label: '태양광', fields: ['fuelPwr8'] },
  { key: 'wind', label: '풍력', fields: ['fuelPwr9'] },
  { key: 'renew', label: '기타 신재생', fields: ['fuelPwr10'] },
  { key: 'hydro', label: '수력·양수', fields: ['fuelPwr1', 'fuelPwr5'] },
  { key: 'oil', label: '유류', fields: ['fuelPwr2'] },
];

function itemsOf(json: unknown): Array<Record<string, unknown>> {
  const j = json as { response?: { body?: { items?: { item?: unknown } | string } } };
  let items: unknown = j?.response?.body?.items;
  if (items && typeof items === 'object' && 'item' in (items as object)) items = (items as { item?: unknown }).item;
  if (!items || typeof items === 'string') return [];
  const list = Array.isArray(items) ? items : [items];
  return (list as Array<Record<string, unknown>>).filter((it) => it && typeof it === 'object');
}

function numOrNull(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseLiveMix(list: Array<Record<string, unknown>>): LiveMix | null {
  if (list.length === 0) return null;
  const timeOf = (it: Record<string, unknown>) => String(it.baseDateTime ?? it.baseDatetime ?? '');
  const latest = [...list].sort((a, b) => timeOf(a).localeCompare(timeOf(b))).at(-1)!;

  let pumping = 0;
  const rows = LIVE_GROUPS.map((g) => {
    let mw = 0;
    for (const field of g.fields) {
      const v = numOrNull(latest[field]) ?? 0;
      if (v >= 0) mw += v;
      else pumping += -v; // 음수(양수 펌핑)는 발전이 아니라 소비라서 비중에서 뺀다
    }
    return { key: g.key, label: g.label, mw };
  });
  const totalMw = rows.reduce((sum, r) => sum + r.mw, 0);
  if (totalMw <= 0) return null;

  return {
    baseDatetime: toIsoKst(latest.baseDateTime ?? latest.baseDatetime),
    totalMw,
    marketDemandMw: numOrNull(latest.fuelPwrTot),
    items: rows.map((r) => ({ ...r, share: (r.mw / totalMw) * 100 })).sort((a, b) => b.mw - a.mw),
    offMarket: { ppaMw: numOrNull(latest.pEsmw), btmMw: numOrNull(latest.bEmsw) },
    pumpingMw: pumping,
  };
}

async function fetchLiveMix(serviceKey: string): Promise<LiveMix> {
  const key = /%[0-9A-Fa-f]{2}/.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
  const url = (ymd: string) =>
    KPX_LIVE_MIX_URL + '?serviceKey=' + key + '&pageNo=1&numOfRows=10&dataType=JSON&tradeYmd=' + ymd;
  const today = kstDay().replace(/-/g, '');
  let list = itemsOf(await kpxGet(url(today)));
  if (list.length === 0) {
    // 자정 직후에는 오늘 값이 아직 없을 수 있어 어제의 마지막 값을 쓴다.
    const y = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    list = itemsOf(await kpxGet(url(y)));
  }
  const parsed = parseLiveMix(list);
  if (!parsed) throw new Error('실시간 발전원 값을 찾지 못했습니다.');
  return parsed;
}

let liveMixCache: { at: number; data: LiveMix } | null = null;

// ---------------------------------------------------------------------------
// 뉴스 피드 (구글 뉴스 RSS). 제목·언론사·날짜·링크만 가져와 보여 주고, 본문은 복사하지 않는다.
// ---------------------------------------------------------------------------

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO
}

type NewsTopic = 'duck' | 'demand' | 'renew' | 'price' | 'all';

const NEWS_QUERIES: Record<Exclude<NewsTopic, 'all'>, string> = {
  duck: '("덕커브" OR "덕 커브" OR "출력제어" OR "경부하기" OR "순부하") when:180d',
  demand: '(전력수요 OR 전력수급 OR 전력예비율 OR 전력거래소) when:7d',
  renew: '(태양광 OR 풍력 OR 재생에너지 OR ESS) 발전 when:7d',
  price: '(전기요금 OR 한국전력 OR 전력시장 OR SMP) when:7d',
};

const NEWS_CACHE_MS = (Number(process.env.NEWS_CACHE_SEC) || 10 * 60) * 1000;
const NEWS_MAX_ITEMS = 30;
const newsCache = new Map<string, { at: number; items: NewsItem[] }>();

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlTag(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? decodeXmlEntities(m[1]).trim() : '';
}

export function parseNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const rawTitle = xmlTag(block, 'title');
    const link = xmlTag(block, 'link');
    const source = xmlTag(block, 'source');
    const time = new Date(xmlTag(block, 'pubDate'));
    // 구글 뉴스 링크만 허용 (피드가 이상한 주소를 줘도 화면에 링크로 만들지 않는다).
    if (!rawTitle || !link.startsWith('https://news.google.com/') || Number.isNaN(time.getTime())) continue;
    const suffix = source ? ` - ${source}` : '';
    const title = suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;
    // 언론사 이름 대신 주소가 오는 기사는 도메인만 보여 준다.
    let sourceName = source || '언론사 미상';
    if (/^https?:\/\//.test(sourceName)) {
      try {
        sourceName = new URL(sourceName).hostname.replace(/^www\./, '');
      } catch {
        sourceName = '언론사 미상';
      }
    }
    items.push({ title, link, source: sourceName, publishedAt: time.toISOString() });
  }
  return items;
}

async function fetchNewsQuery(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; duck-curve-radar)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`뉴스 서버 응답 오류 (${res.status})`);
  return parseNewsRss(await res.text());
}

function mergeNews(lists: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of lists.flat()) {
    const key = item.title.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return merged.slice(0, NEWS_MAX_ITEMS);
}

async function loadNews(topic: NewsTopic): Promise<NewsItem[]> {
  const queries =
    topic === 'all'
      ? [NEWS_QUERIES.demand, NEWS_QUERIES.renew, NEWS_QUERIES.price]
      : [NEWS_QUERIES[topic]];
  // 일부 검색이 실패해도 나머지로 보여 주고, 전부 실패했을 때만 오류로 본다.
  const settled = await Promise.allSettled(queries.map(fetchNewsQuery));
  const ok = settled.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled');
  if (ok.length === 0) {
    const reason = (settled[0] as PromiseRejectedResult).reason;
    throw reason instanceof Error ? reason : new Error('뉴스를 가져오지 못했습니다.');
  }
  return mergeNews(ok.map((r) => r.value));
}

// ---------------------------------------------------------------------------
// 오늘의 전기 소식 3줄 (뉴스 제목만 보고 Gemini가 정리)
// ---------------------------------------------------------------------------

const NEWS_BRIEF_SYSTEM =
  "너는 전기와 에너지 소식을 쉽게 전하는 해설자야. 아래 기사 제목들만 보고, 오늘의 전기 관련 이슈 3가지를 일반인이 이해하기 쉬운 말로 한 줄씩 짧게(각 40자 안팎, 최대 60자) 정리해. 제목에 없는 숫자나 사실은 만들지 마. 확실하지 않은 내용은 '~라고 해요'처럼 전해. 비슷한 제목은 하나로 합쳐. 반드시 문자열 3개로 된 JSON 배열만 출력해.";

let briefCache: { at: number; bullets: string[]; basedOn: number } | null = null;
const BRIEF_CACHE_MS = 30 * 60 * 1000;

async function summarizeHeadlines(apiKey: string, titles: string[]): Promise<string[]> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' }, timeout: 14000 },
  });
  const models: Array<{ model: string; level: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW },
  ];
  const contents = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  let lastError: unknown = null;
  for (const m of models) {
    try {
      const response = await ai.models.generateContent({
        model: m.model,
        contents,
        config: {
          systemInstruction: NEWS_BRIEF_SYSTEM,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: m.level },
          abortSignal: AbortSignal.timeout(14000),
        },
      });
      const arr = JSON.parse(response.text?.trim() ?? '');
      const bullets = Array.isArray(arr)
        ? arr
            .map((x) => String(x).replace(/^\s*\d+[.)]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];
      if (bullets.length > 0) return bullets;
      lastError = new Error('empty summary');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('summary failed');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '64kb' }));

  app.get('/api/live-demand', async (req: Request, res: Response) => {
    const serviceKey = process.env.KPX_SERVICE_KEY;
    if (!serviceKey || serviceKey === 'MY_KPX_SERVICE_KEY') {
      res.status(503).json({
        error: 'KPX_SERVICE_KEY가 설정되지 않았습니다. .env에 공공데이터포털 인증키를 넣어 주세요.',
        code: 'NO_KEY',
      });
      return;
    }

    const force = req.query.force === '1';
    const age = liveCache ? Date.now() - liveCache.at : Infinity;
    // 전력거래소 값이 5분마다 갱신되므로, 하루 호출 한도(95건)에 여유가 있는 동안은 5분마다 새로 받는다.
    // 60건을 넘으면 남은 한도를 아끼려고 기본 간격(15분)으로 늘린다.
    const usedToday = callCounters.get('live')?.count ?? 0;
    const autoTtl = usedToday < 60 ? Math.min(5 * 60 * 1000, LIVE_CACHE_MS) : LIVE_CACHE_MS;
    const cacheTtl = force ? FORCE_MIN_INTERVAL_MS : autoTtl;

    if (liveCache && age < cacheTtl) {
      res.json({
        ...liveCache.data,
        fetchedAt: new Date(liveCache.at).toISOString(),
        cached: true,
        // 새로고침이 너무 잦을 때 화면이 몇 초 뒤에 다시 시도하라고 안내할 수 있게 한다.
        retryAfterSec: force ? Math.ceil((FORCE_MIN_INTERVAL_MS - age) / 1000) : undefined,
      });
      return;
    }

    if (!reserveApiCall('live')) {
      if (liveCache) {
        res.json({
          ...liveCache.data,
          fetchedAt: new Date(liveCache.at).toISOString(),
          cached: true,
          limited: true,
        });
      } else {
        res.status(429).json({ error: '오늘 실시간 조회 한도에 도달했어요. 내일 다시 시도해 주세요.' });
      }
      return;
    }

    try {
      const data = await fetchLiveDemand(serviceKey);
      liveCache = { at: Date.now(), data };
      res.json({ ...data, fetchedAt: new Date(liveCache.at).toISOString(), cached: false });
    } catch (err) {
      console.error('[live-demand] KPX API call failed:', err);
      // 직전 값이 있으면 오래된 값이라도 돌려준다.
      if (liveCache) {
        res.json({ ...liveCache.data, fetchedAt: new Date(liveCache.at).toISOString(), cached: true, stale: true });
        return;
      }
      const isTimeout = (err as Error)?.name === 'TimeoutError';
      res.status(502).json({
        error: isTimeout
          ? '전력거래소 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.'
          : (err as Error)?.message || '실시간 전력수급 정보를 가져오지 못했습니다.',
      });
    }
  });

  app.get('/api/generation-mix', async (req: Request, res: Response) => {
    const serviceKey = process.env.KPX_SERVICE_KEY;
    if (!serviceKey || serviceKey === 'MY_KPX_SERVICE_KEY') {
      res.status(503).json({ error: 'KPX_SERVICE_KEY가 설정되지 않았습니다.', code: 'NO_KEY' });
      return;
    }
    const force = req.query.force === '1';
    const age = mixCache ? Date.now() - mixCache.at : Infinity;
    if (mixCache && age < (force ? 10 * 60 * 1000 : MIX_CACHE_MS)) {
      res.json({ ...mixCache.data, fetchedAt: new Date(mixCache.at).toISOString(), cached: true });
      return;
    }
    if (!reserveApiCall('mix')) {
      if (mixCache) {
        res.json({ ...mixCache.data, fetchedAt: new Date(mixCache.at).toISOString(), cached: true, limited: true });
      } else {
        res.status(429).json({ error: '오늘 발전원 조회 한도에 도달했어요. 내일 다시 시도해 주세요.' });
      }
      return;
    }
    try {
      const data = await fetchGenerationMix(serviceKey);
      mixCache = { at: Date.now(), data };
      res.json({ ...data, fetchedAt: new Date(mixCache.at).toISOString(), cached: false });
    } catch (err) {
      console.error('[generation-mix] failed:', err);
      if (mixCache) {
        res.json({ ...mixCache.data, fetchedAt: new Date(mixCache.at).toISOString(), cached: true, stale: true });
        return;
      }
      // 30: 등록되지 않은 서비스키 = 이 API를 아직 활용신청하지 않았다.
      if ((err as Error & { kpxCode?: string }).kpxCode === '30') {
        // 아직 신청이 반영되지 않아 거절된 호출은 하루 한도에서 뺀다 (승인 직후 바로 쓸 수 있게).
        const entry = callCounters.get('mix');
        if (entry && entry.count > 0) entry.count--;
        res.status(403).json({ error: '발전원별 발전량 API(한국전력거래소_발전원별 발전량)를 활용신청해야 볼 수 있어요.', code: 'NOT_APPLIED' });
        return;
      }
      res.status(502).json({ error: (err as Error).message || '발전원 정보를 가져오지 못했습니다.' });
    }
  });

  app.get('/api/news-brief', async (_req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
      return;
    }
    if (briefCache && Date.now() - briefCache.at < BRIEF_CACHE_MS) {
      res.json({
        bullets: briefCache.bullets,
        basedOn: briefCache.basedOn,
        fetchedAt: new Date(briefCache.at).toISOString(),
        cached: true,
      });
      return;
    }
    try {
      const cachedNews = newsCache.get('all');
      const fresh = cachedNews && Date.now() - cachedNews.at < NEWS_CACHE_MS;
      const items = fresh ? cachedNews.items : await loadNews('all');
      if (!fresh) newsCache.set('all', { at: Date.now(), items });
      const titles = items.slice(0, 15).map((n) => n.title);
      if (titles.length === 0) {
        res.status(404).json({ error: '요약할 기사가 아직 없어요.' });
        return;
      }
      const bullets = await summarizeHeadlines(apiKey, titles);
      briefCache = { at: Date.now(), bullets, basedOn: titles.length };
      res.json({ bullets, basedOn: titles.length, fetchedAt: new Date().toISOString(), cached: false });
    } catch (err) {
      console.error('[news-brief] failed:', err);
      if (briefCache) {
        res.json({
          bullets: briefCache.bullets,
          basedOn: briefCache.basedOn,
          fetchedAt: new Date(briefCache.at).toISOString(),
          cached: true,
          stale: true,
        });
        return;
      }
      res.status(502).json({ error: '소식을 정리하지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
  });

  app.get('/api/generation-live', async (req: Request, res: Response) => {
    const serviceKey = process.env.KPX_SERVICE_KEY;
    if (!serviceKey || serviceKey === 'MY_KPX_SERVICE_KEY') {
      res.status(503).json({ error: 'KPX_SERVICE_KEY가 설정되지 않았습니다.', code: 'NO_KEY' });
      return;
    }
    const force = req.query.force === '1';
    // 값이 5분마다 갱신되므로 한도에 여유가 있는 동안은 5분마다 새로 받고, 60건을 넘으면 15분으로 늘린다.
    const usedToday = callCounters.get('mixlive')?.count ?? 0;
    const autoTtl = usedToday < 60 ? 5 * 60 * 1000 : 15 * 60 * 1000;
    const age = liveMixCache ? Date.now() - liveMixCache.at : Infinity;
    if (liveMixCache && age < (force ? 60 * 1000 : autoTtl)) {
      res.json({
        ...liveMixCache.data,
        fetchedAt: new Date(liveMixCache.at).toISOString(),
        cached: true,
        retryAfterSec: force ? Math.ceil((60 * 1000 - age) / 1000) : undefined,
      });
      return;
    }
    if (!reserveApiCall('mixlive')) {
      if (liveMixCache) {
        res.json({ ...liveMixCache.data, fetchedAt: new Date(liveMixCache.at).toISOString(), cached: true, limited: true });
      } else {
        res.status(429).json({ error: '오늘 실시간 발전원 조회 한도에 도달했어요. 내일 다시 시도해 주세요.' });
      }
      return;
    }
    try {
      const data = await fetchLiveMix(serviceKey);
      liveMixCache = { at: Date.now(), data };
      res.json({ ...data, fetchedAt: new Date(liveMixCache.at).toISOString(), cached: false });
    } catch (err) {
      console.error('[generation-live] failed:', err);
      if (liveMixCache) {
        res.json({ ...liveMixCache.data, fetchedAt: new Date(liveMixCache.at).toISOString(), cached: true, stale: true });
        return;
      }
      if ((err as Error & { kpxCode?: string }).kpxCode === '30') {
        const entry = callCounters.get('mixlive');
        if (entry && entry.count > 0) entry.count--;
        res.status(403).json({
          error: '실시간 발전원 API(발전원별 발전량 현황조회_GW)를 활용신청해야 볼 수 있어요.',
          code: 'NOT_APPLIED',
        });
        return;
      }
      res.status(502).json({ error: (err as Error).message || '실시간 발전원 정보를 가져오지 못했습니다.' });
    }
  });

  app.get('/api/news', async (req: Request, res: Response) => {
    const topicParam = String(req.query.topic ?? 'all');
    const topic = (['duck', 'demand', 'renew', 'price', 'all'] as const).find((t) => t === topicParam);
    if (!topic) {
      res.status(400).json({ error: '알 수 없는 주제입니다.' });
      return;
    }

    const cached = newsCache.get(topic);
    const force = req.query.force === '1';
    // 새로고침 버튼은 30초 이상 지난 캐시만 건너뛴다 (연타 방지).
    const ttl = force ? 30 * 1000 : NEWS_CACHE_MS;
    if (cached && Date.now() - cached.at < ttl) {
      res.json({ topic, items: cached.items, fetchedAt: new Date(cached.at).toISOString(), cached: true });
      return;
    }

    try {
      const items = await loadNews(topic);
      newsCache.set(topic, { at: Date.now(), items });
      res.json({ topic, items, fetchedAt: new Date().toISOString(), cached: false });
    } catch (err) {
      console.error('[news] fetch failed:', err);
      if (cached) {
        res.json({ topic, items: cached.items, fetchedAt: new Date(cached.at).toISOString(), cached: true, stale: true });
        return;
      }
      const isTimeout = (err as Error)?.name === 'TimeoutError';
      res.status(502).json({
        error: isTimeout ? '뉴스 서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.' : '뉴스를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
      });
    }
  });

  app.post('/api/ai-insights', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.error('[ai-insights] GEMINI_API_KEY is missing or unset');
      res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
      return;
    }

    const payload = req.body as AiInsightsPayload | undefined;
    if (
      !payload ||
      !payload.minDemand ||
      !payload.minNetLoad ||
      !Array.isArray(payload.dayRange) ||
      !Array.isArray(payload.eveningRange)
    ) {
      res.status(400).json({ error: '계산된 요약 데이터가 올바르지 않습니다.' });
      return;
    }

    const overallController = new AbortController();
    const overallTimeoutId = setTimeout(() => overallController.abort(), 28000);

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          timeout: 14000,
        },
      });

      const prompt = formatCalculatedSummaryPrompt(payload);
      const candidates: Array<{
        model: string;
        thinkingLevel: ThinkingLevel;
        attemptTimeoutMs: number;
      }> = [
        {
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
          attemptTimeoutMs: 12000,
        },
        {
          model: 'gemini-3.1-flash-lite',
          thinkingLevel: ThinkingLevel.MINIMAL,
          attemptTimeoutMs: 14000,
        },
      ];

      let lastError: unknown = null;
      let responseText: string | undefined;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (overallController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const attemptController = new AbortController();
        const attemptTimer = setTimeout(
          () => attemptController.abort(),
          candidate.attemptTimeoutMs
        );
        const onOverallAbort = () => attemptController.abort();
        overallController.signal.addEventListener('abort', onOverallAbort, {
          once: true,
        });

        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: {
                thinkingLevel: candidate.thinkingLevel,
              },
              abortSignal: attemptController.signal,
            },
          });
          responseText = response.text?.trim();
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const isAttemptTimeout =
            !overallController.signal.aborted &&
            attemptController.signal.aborted;
          const shouldFallback =
            i < candidates.length - 1 &&
            !overallController.signal.aborted &&
            (isAttemptTimeout || isRetryableGeminiError(err));

          if (shouldFallback) {
            console.warn(
              `[ai-insights] ${candidate.model} failed (${isAttemptTimeout ? 'timeout' : 'retryable error'}), trying fallback model...`
            );
            continue;
          }
          throw err;
        } finally {
          clearTimeout(attemptTimer);
          overallController.signal.removeEventListener('abort', onOverallAbort);
        }
      }

      if (lastError) {
        throw lastError;
      }

      if (!responseText) {
        console.error('[ai-insights] Empty response from Gemini');
        res.status(502).json({ error: 'AI 응답이 비어 있습니다. 다시 시도해 주세요.' });
        return;
      }

      res.json({ text: responseText });
    } catch (err) {
      console.error('[ai-insights] Gemini API call failed:', err);
      const info = extractShortError(err);
      res.status(info.status).json({ error: info.message });
    } finally {
      clearTimeout(overallTimeoutId);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
