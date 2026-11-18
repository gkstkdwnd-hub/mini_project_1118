/**
 * 한국전력 주택용 전기요금 계산.
 *
 * 근거 (2026-11-18에 확인)
 * - 요금표(기본요금, 구간별 전력량요금, 구간 경계, 슈퍼유저 요금):
 *   한국전력 사이버지점 ‘한글 전기요금표(주택용-저압/고압)’, 2023.11.9 시행표
 *   https://cyber.kepco.co.kr/ckepco/front/jsp/CY/E/E/CYEEHP00101.jsp
 * - 청구 계산 순서와 끝자리 처리: 한국전력 전기요금계산기 안내 (기본요금·사용량요금은 원 단위 미만 절사,
 *   부가가치세는 원 단위 미만 4사5입, 전력산업기반기금과 청구요금 합계는 10원 미만 절사)
 * - 전력산업기반기금 요율: 2024.7 3.2%, 2025.7 2.7% (정부 정책브리핑 2024.5.28, 기획재정부)
 *   https://www.korea.kr/news/policyNewsView.do?newsId=148929635
 * - 연료비조정단가 +5원/kWh: 2026년 4분기 전기요금 동결 보도 (한전 2026.9.21 발표)
 *
 * 확인하지 못한 값
 * - 기후환경요금 9.0원/kWh는 한전 공식 문서가 아니라 2차 자료(2026)로만 확인했다.
 *   그래서 화면에서 고지서의 값으로 고칠 수 있게 한다.
 *
 * 계산에 넣지 않은 것: 복지·대가족·출산가구 등 할인, 자동이체·전자고지 할인, TV수신료(별도 징수).
 */

export type Supply = 'low' | 'high';

export interface Rates {
  /** 기후환경요금 (원/kWh) */
  climate: number;
  /** 연료비조정요금 (원/kWh, 음수 가능) */
  fuel: number;
  /** 전력산업기반기금 요율 (0.027 = 2.7%) */
  fundRate: number;
  /** 고지서에 적힌 복지·대가족·자동이체 등 할인액 (원). 전기요금계에서 빼고 세금을 매긴다. */
  discount: number;
}

export const DEFAULT_RATES: Rates = { climate: 9.0, fuel: 5.0, fundRate: 0.027, discount: 0 };

export const TARIFF_AS_OF = '2023.11.9 시행 요금표 (2026.11.18 한전 사이버지점에서 확인)';

interface Tier {
  base: number; // 기본요금 (원/호)
  energy: number; // 전력량요금 (원/kWh)
}

interface Table {
  tiers: [Tier, Tier, Tier];
  superUser: number; // 1,000kWh 초과분 전력량요금 (원/kWh)
}

const TABLES: Record<Supply, Table> = {
  low: {
    tiers: [
      { base: 910, energy: 120.0 },
      { base: 1600, energy: 214.6 },
      { base: 7300, energy: 307.3 },
    ],
    superUser: 736.2,
  },
  high: {
    tiers: [
      { base: 730, energy: 105.0 },
      { base: 1260, energy: 174.0 },
      { base: 6060, energy: 242.3 },
    ],
    superUser: 593.3,
  },
};

const SUPER_USER_KWH = 1000;

/** 하계(7·8월)는 300/450kWh, 그 외는 200/400kWh가 구간 경계다. */
export function isSummer(month: number): boolean {
  return month === 7 || month === 8;
}

/** 슈퍼유저 요금은 하계(7~8월)와 동계(12~2월)에 적용된다. */
export function hasSuperUser(month: number): boolean {
  return month === 7 || month === 8 || month === 12 || month === 1 || month === 2;
}

export function tierLimits(month: number): [number, number] {
  return isSummer(month) ? [300, 450] : [200, 400];
}

export interface EnergyLine {
  label: string;
  kwh: number;
  rate: number;
  won: number;
}

export interface Bill {
  kwh: number;
  tier: 1 | 2 | 3;
  limits: [number, number];
  /** 다음 구간까지 남은 kWh (마지막 구간이면 null) */
  toNextTier: number | null;
  base: number;
  energyLines: EnergyLine[];
  energy: number;
  climate: number;
  fuel: number;
  discount: number; // 적용된 할인액
  subtotal: number; // 전기요금계
  vat: number;
  fund: number;
  total: number; // 청구요금 합계
}

const floor = (n: number) => Math.floor(n + 1e-9);
const floor10 = (n: number) => Math.floor(n / 10 + 1e-9) * 10;
const round = (n: number) => Math.round(n + 1e-9); // 원 단위 미만 4사5입

export function calcBill(kwhRaw: number, month: number, supply: Supply, rates: Rates = DEFAULT_RATES): Bill {
  const kwh = Math.max(0, Number.isFinite(kwhRaw) ? kwhRaw : 0);
  const table = TABLES[supply];
  const [l1, l2] = tierLimits(month);
  const tier: 1 | 2 | 3 = kwh <= l1 ? 1 : kwh <= l2 ? 2 : 3;
  const base = table.tiers[tier - 1].base;

  const lines: EnergyLine[] = [];
  const push = (label: string, amount: number, rate: number) => {
    if (amount > 0) lines.push({ label, kwh: amount, rate, won: rate * amount });
  };

  const t1 = Math.min(kwh, l1);
  push(`1구간 (~${l1}kWh)`, t1, table.tiers[0].energy);
  const t2 = Math.min(Math.max(0, kwh - l1), l2 - l1);
  push(`2구간 (${l1 + 1}~${l2}kWh)`, t2, table.tiers[1].energy);

  if (hasSuperUser(month) && kwh > SUPER_USER_KWH) {
    const t3 = Math.max(0, Math.min(kwh, SUPER_USER_KWH) - l2);
    push(`3구간 (${l2 + 1}~${SUPER_USER_KWH}kWh)`, t3, table.tiers[2].energy);
    push(`슈퍼유저 (${SUPER_USER_KWH}kWh 초과)`, kwh - SUPER_USER_KWH, table.superUser);
  } else {
    push(`3구간 (${l2}kWh 초과)`, Math.max(0, kwh - l2), table.tiers[2].energy);
  }

  const energy = floor(lines.reduce((s, l) => s + l.won, 0));
  const climate = floor(kwh * rates.climate);
  const fuel = Math.trunc(kwh * rates.fuel); // 음수일 때도 0 방향으로 절사
  // 한전 계산 순서: 전기요금계 = 기본요금 + 사용량요금 − 할인. 세금과 기금은 할인 뒤 금액에 매긴다.
  const discount = Math.min(Math.max(0, Math.trunc(rates.discount || 0)), base + energy + climate + fuel);
  const subtotal = base + energy + climate + fuel - discount;
  const vat = round(subtotal * 0.1);
  const fund = floor10(subtotal * rates.fundRate);
  const total = floor10(subtotal + vat + fund);

  return {
    kwh,
    tier,
    limits: [l1, l2],
    toNextTier: tier === 1 ? l1 - kwh : tier === 2 ? l2 - kwh : null,
    base,
    energyLines: lines,
    energy,
    climate,
    fuel,
    discount,
    subtotal,
    vat,
    fund,
    total,
  };
}

/**
 * 청구금액으로 사용량(kWh)을 거꾸로 추정한다.
 * 요금은 사용량이 늘면 같거나 커지므로(구간 경계에서 기본요금이 뛰는 구간만 건너뜀),
 * 그 금액 이상이 되는 가장 작은 정수 kWh를 돌려준다.
 * 구간 경계 근처의 금액은 정확히 맞는 사용량이 없을 수 있어 gap(원)으로 오차를 함께 알려 준다.
 */
export function estimateKwhFromBill(
  amount: number,
  month: number,
  supply: Supply,
  rates: Rates = DEFAULT_RATES
): { kwh: number; billed: number; gap: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const MAX = 5000;
  if (calcBill(MAX, month, supply, rates).total < amount) return null;
  let lo = 0;
  let hi = MAX;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calcBill(mid, month, supply, rates).total >= amount) hi = mid;
    else lo = mid + 1;
  }
  const billed = calcBill(lo, month, supply, rates).total;
  return { kwh: lo, billed, gap: billed - amount };
}
