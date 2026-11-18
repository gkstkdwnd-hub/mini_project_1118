import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, ExternalLink, Minus, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { Bill, DEFAULT_RATES, Rates, Supply, calcBill, estimateKwhFromBill, hasSuperUser, isSummer } from '../utils/kepcoBill';

interface CatalogItem {
  name: string;
  watts: number; // 사용 중 평균 소비전력(대략값)
  hours: number; // 하루 사용 시간(대략값)
  aliases?: string[];
}

// 모두 대략적인 평균 예시값이다. 제품마다 다르므로 담은 뒤 W와 시간을 직접 고쳐 쓰게 한다.
const CATALOG: CatalogItem[] = [
  { name: '냉장고', watts: 60, hours: 24, aliases: ['양문형'] },
  { name: '김치냉장고', watts: 50, hours: 24 },
  { name: '벽걸이 에어컨', watts: 800, hours: 5, aliases: ['에어콘', '냉방'] },
  { name: '스탠드 에어컨', watts: 1500, hours: 4, aliases: ['에어콘', '냉방'] },
  { name: '선풍기', watts: 40, hours: 6 },
  { name: '서큘레이터', watts: 30, hours: 6 },
  { name: '전기장판', watts: 100, hours: 6, aliases: ['전기요', '전기매트'] },
  { name: '전기히터', watts: 1500, hours: 3, aliases: ['온풍기', '난방', '팬히터'] },
  { name: '제습기', watts: 300, hours: 5 },
  { name: '가습기', watts: 30, hours: 8 },
  { name: '공기청정기', watts: 40, hours: 12 },
  { name: '세탁기', watts: 400, hours: 1, aliases: ['드럼세탁기'] },
  { name: '건조기', watts: 2000, hours: 1 },
  { name: '식기세척기', watts: 1200, hours: 1 },
  { name: '로봇청소기', watts: 40, hours: 1 },
  { name: '청소기', watts: 1000, hours: 0.5 },
  { name: '전기밥솥', watts: 100, hours: 5, aliases: ['밥솥', '쿠쿠'] },
  { name: '전자레인지', watts: 1000, hours: 0.3, aliases: ['렌지'] },
  { name: '에어프라이어', watts: 1400, hours: 0.5 },
  { name: '전기포트', watts: 1500, hours: 0.2, aliases: ['커피포트', '주전자'] },
  { name: '전기오븐', watts: 2000, hours: 0.5, aliases: ['오븐'] },
  { name: '인덕션(1구)', watts: 1800, hours: 1, aliases: ['전기레인지', '쿡탑'] },
  { name: '토스터', watts: 800, hours: 0.1 },
  { name: '커피머신', watts: 1200, hours: 0.2, aliases: ['커피메이커'] },
  { name: '정수기', watts: 80, hours: 24 },
  { name: '비데', watts: 50, hours: 24 },
  { name: '헤어드라이어', watts: 1200, hours: 0.2, aliases: ['드라이기', '드라이어'] },
  { name: '다리미', watts: 1200, hours: 0.3 },
  { name: 'TV', watts: 100, hours: 5, aliases: ['텔레비전', '티비'] },
  { name: '모니터', watts: 30, hours: 6 },
  { name: '노트북', watts: 50, hours: 6, aliases: ['랩탑'] },
  { name: '데스크톱 PC', watts: 200, hours: 6, aliases: ['컴퓨터', '피씨'] },
  { name: '게임기', watts: 150, hours: 2, aliases: ['플스', '플레이스테이션', '닌텐도'] },
  { name: '공유기', watts: 10, hours: 24, aliases: ['와이파이'] },
  { name: 'LED 전등', watts: 10, hours: 5, aliases: ['조명', '전구', '형광등'] },
  { name: '전기차 완속충전', watts: 7000, hours: 3, aliases: ['전기차', '충전기'] },
  { name: '스마트폰 충전', watts: 10, hours: 3, aliases: ['핸드폰', '충전'] },
];

const QUICK = ['냉장고', '벽걸이 에어컨', '선풍기', '전기장판', '건조기', 'TV', '전기밥솥', '에어프라이어'];

interface Item {
  id: string;
  name: string;
  watts: string;
  hours: string;
  days: string;
  qty: number;
  on: boolean; // 합계에 포함할지
  /** watt: 소비전력×시간으로 계산, label: 제품 라벨의 월 소비전력량(kWh)을 직접 입력 */
  mode: 'watt' | 'label';
  monthKwh: string;
}

interface Saved {
  items: Item[];
  totalKwh: string;
  month: number;
  supply: Supply;
  climate: string;
  fuel: string;
  fundPct: string;
  discount: string;
  billAmount: string;
}

const STORAGE_KEY = 'appliance-board-v2';

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function signedNum(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function kstMonth(): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date())) || 1;
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR');

function loadSaved(): Partial<Saved> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it) => it && typeof it.name === 'string')
          .map((it) => ({
            id: typeof it.id === 'string' ? it.id : newId(),
            name: it.name,
            watts: String(it.watts ?? '0'),
            hours: String(it.hours ?? '0'),
            days: String(it.days ?? '30'),
            qty: Number.isInteger(it.qty) && it.qty > 0 ? it.qty : 1,
            on: it.on !== false,
            mode: (it as Partial<Item>).mode === 'label' ? ('label' as const) : ('watt' as const),
            monthKwh: String((it as Partial<Item>).monthKwh ?? ''),
          }))
      : [];
    return { ...parsed, items };
  } catch {
    return null;
  }
}

const field =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-mono-num text-slate-900 outline-none focus:border-teal-600';

export const ApplianceCalculator: React.FC = () => {
  const saved = useMemo(() => loadSaved(), []);
  const [items, setItems] = useState<Item[]>(saved?.items ?? []);
  const [totalKwh, setTotalKwh] = useState(saved?.totalKwh ?? '');
  const [month, setMonth] = useState(saved?.month && saved.month >= 1 && saved.month <= 12 ? saved.month : kstMonth());
  const [supply, setSupply] = useState<Supply>(saved?.supply === 'high' ? 'high' : 'low');
  const [climate, setClimate] = useState(saved?.climate ?? String(DEFAULT_RATES.climate));
  const [fuel, setFuel] = useState(saved?.fuel ?? String(DEFAULT_RATES.fuel));
  const [fundPct, setFundPct] = useState(saved?.fundPct ?? String(DEFAULT_RATES.fundRate * 100));
  const [discount, setDiscount] = useState(saved?.discount ?? '0');
  const [billAmount, setBillAmount] = useState(saved?.billAmount ?? '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [customWatts, setCustomWatts] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 담은 목록과 설정은 이 기기 브라우저에만 저장한다 (서버로 보내지 않는다).
  useEffect(() => {
    try {
      const data: Saved = { items, totalKwh, month, supply, climate, fuel, fundPct, discount, billAmount };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 저장이 막혀 있어도 계산은 그대로 된다 */
    }
  }, [items, totalKwh, month, supply, climate, fuel, fundPct, discount, billAmount]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = norm(query);
  const matches = useMemo(() => {
    if (!q) return [];
    return CATALOG.filter((c) => norm(c.name).includes(q) || (c.aliases ?? []).some((a) => norm(a).includes(q))).slice(0, 8);
  }, [q]);
  const exact = CATALOG.some((c) => norm(c.name) === q);

  const addItem = (name: string, watts: number, hours: number) => {
    setItems((prev) => [...prev, { id: newId(), name, watts: String(watts), hours: String(hours), days: '30', qty: 1, on: true, mode: 'watt', monthKwh: '' }]);
    setQuery('');
    setCustomWatts('');
    setOpen(false);
  };
  const addCatalog = (c: CatalogItem) => addItem(c.name, c.watts, c.hours);
  const addCustom = () => {
    const name = query.trim();
    if (!name) return;
    addItem(name, num(customWatts), 1);
  };
  const patch = (id: string, change: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)));

  const rates: Rates = useMemo(
    () => ({
      climate: signedNum(climate, DEFAULT_RATES.climate),
      fuel: signedNum(fuel, DEFAULT_RATES.fuel),
      fundRate: Math.max(0, signedNum(fundPct, DEFAULT_RATES.fundRate * 100)) / 100,
      discount: Math.max(0, signedNum(discount, 0)),
    }),
    [climate, fuel, fundPct, discount]
  );
  const ratesChanged =
    rates.climate !== DEFAULT_RATES.climate ||
    rates.fuel !== DEFAULT_RATES.fuel ||
    rates.fundRate !== DEFAULT_RATES.fundRate ||
    rates.discount !== DEFAULT_RATES.discount;

  const T = num(totalKwh);
  const hasTotal = T > 0;

  const model = useMemo(() => {
    const rows = items.map((it) => {
      const kwh =
        it.mode === 'label' ? num(it.monthKwh) * it.qty : (num(it.watts) / 1000) * num(it.hours) * num(it.days) * it.qty;
      // 하루 1시간 줄였을 때 줄어드는 kWh (W×시간 방식일 때만)
      const hourKwh = it.mode === 'watt' ? (num(it.watts) / 1000) * Math.min(1, num(it.hours)) * num(it.days) * it.qty : 0;
      return { it, kwh, hourKwh };
    });
    const counted = rows.filter((r) => r.it.on);
    const sumKwh = counted.reduce((s, r) => s + r.kwh, 0);
    const bill = (k: number): Bill => calcBill(k, month, supply, rates);

    if (!hasTotal) return { rows, counted, sumKwh, billAll: null as Bill | null, billWithout: null as Bill | null, marginalAll: null as number | null, perItem: new Map<string, number>(), saving: new Map<string, number>(), next: null as null | { kwh: number; base: number; rate: number; tier: number } };

    const billAll = bill(T);
    const billWithout = bill(Math.max(0, T - sumKwh));
    const perItem = new Map<string, number>();
    const saving = new Map<string, number>();
    for (const r of rows) {
      perItem.set(r.it.id, billAll.total - bill(Math.max(0, T - r.kwh)).total);
      if (r.hourKwh > 0) saving.set(r.it.id, billAll.total - bill(Math.max(0, T - r.hourKwh)).total);
    }

    let next: null | { kwh: number; base: number; rate: number; tier: number } = null;
    if (billAll.toNextTier !== null) {
      const over = bill(T + billAll.toNextTier + 1);
      const lastRate = over.energyLines[over.energyLines.length - 1]?.rate ?? 0;
      next = { kwh: billAll.toNextTier, base: over.base - billAll.base, rate: lastRate, tier: billAll.tier + 1 };
    }
    return { rows, counted, sumKwh, billAll, billWithout, marginalAll: billAll.total - billWithout.total, perItem, saving, next };
  }, [items, hasTotal, T, month, supply, rates]);

  const { rows, counted, sumKwh, billAll, billWithout, marginalAll, perItem, saving, next } = model;

  // 청구금액으로 사용량 역산, 그리고 내 고지서와 계산값 비교
  const amount = num(billAmount);
  const estimate = useMemo(() => estimateKwhFromBill(amount, month, supply, rates), [amount, month, supply, rates]);
  const myBill = hasTotal ? calcBill(T, month, supply, rates).total : null;
  const excludedCount = rows.length - counted.length;
  const top = counted.length > 0 ? counted.reduce((a, b) => (b.kwh > a.kwh ? b : a)) : null;
  const overTotal = hasTotal && sumKwh > T;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <Calculator className="w-4 h-4 text-teal-700" />
        <h3 className="font-bold text-sm text-slate-900">우리 집 가전, 한 달에 얼마?</h3>
      </div>

      <div className="p-4 space-y-5">
        {/* 1. 우리 집 정보 */}
        <section className="space-y-3 p-3.5 rounded-xl bg-teal-50/50 border border-teal-100">
          <div>
            <p className="text-sm font-bold text-slate-900">① 우리 집 한 달 전기 사용량</p>
            <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
              전기요금은 한 달 <b>총 사용량</b>이 많을수록 kWh당 단가가 올라가요(누진제). 그래서 가전 하나의 요금도 우리 집 총
              사용량에 따라 달라져요. 고지서의 ‘사용량’ 칸 숫자를 넣어 주세요.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-500">한 달 총 사용량 (kWh)</span>
              <input className={field} inputMode="decimal" placeholder="예: 350" value={totalKwh} onChange={(e) => setTotalKwh(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">어느 달 기준?</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-teal-600"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월{isSummer(m) ? ' (하계)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="block">
              <span className="text-[11px] text-slate-500">공급 방식</span>
              <div role="group" aria-label="공급 방식" className="mt-0.5 inline-flex w-full rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                {(
                  [
                    ['low', '저압'],
                    ['high', '고압'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={supply === key}
                    onClick={() => setSupply(key)}
                    className={`flex-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${supply === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {isSummer(month) ? '7~8월은 구간 경계가 300·450kWh로 넓어져요.' : '구간 경계는 200·400kWh예요.'} 공급 방식은 대부분의 가정이 ‘저압’이고,
            일부 아파트만 ‘고압’이에요(고지서의 계약종별 확인).
          </p>

          <details className="group rounded-lg bg-white border border-teal-100">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none select-none text-[11px] font-semibold text-teal-800">
              <span>사용량(kWh)을 모르겠다면 · 청구금액으로 알아보기</span>
              <span className="text-slate-400 group-open:rotate-90 transition-transform" aria-hidden="true">
                ›
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-teal-100">
              <label className="block">
                <span className="text-[11px] text-slate-500">그 달 청구금액 (원, 전기요금 합계)</span>
                <input className={field} inputMode="numeric" placeholder="예: 70640" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} />
              </label>
              {amount > 0 && estimate && (
                <div className="text-xs text-slate-700 leading-relaxed space-y-1.5">
                  <p>
                    이 금액이면 사용량은 약 <b className="text-teal-800">{estimate.kwh.toLocaleString('ko-KR')}kWh</b>예요
                    {estimate.gap !== 0 && <> (계산 청구액 {won(estimate.billed)}원, {won(Math.abs(estimate.gap))}원 차이)</>}.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTotalKwh(String(estimate.kwh))}
                    className="px-2.5 py-1 rounded-lg bg-teal-700 text-white text-[11px] font-bold hover:bg-teal-800 cursor-pointer"
                  >
                    {estimate.kwh.toLocaleString('ko-KR')}kWh로 채우기
                  </button>
                  {estimate.gap > 500 && (
                    <p className="text-[11px] text-slate-500">차이가 큰 건 구간이 바뀌는 지점(기본요금이 갑자기 오르는 곳)이거나 할인·단가 차이 때문일 수 있어요.</p>
                  )}
                </div>
              )}
              {amount > 0 && !estimate && <p className="text-xs text-rose-700">이 금액에 맞는 사용량을 찾지 못했어요. 금액을 확인해 주세요.</p>}
              {amount > 0 && hasTotal && myBill !== null && (
                <p className="text-[11px] leading-relaxed p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                  위에 넣은 {T.toLocaleString('ko-KR')}kWh로 계산한 청구액은 <b>{won(myBill)}원</b>이고 내 고지서는 <b>{won(amount)}원</b>이에요
                  {myBill === amount
                    ? ' — 정확히 일치해요.'
                    : ' (' + won(Math.abs(myBill - amount)) + '원 ' + (myBill > amount ? '높게' : '낮게') + ' 계산). 할인이나 단가 차이일 수 있어요. 아래 ‘계산 근거와 고지서에 맞추기’에서 고쳐 보세요.'}
                </p>
              )}
            </div>
          </details>
        </section>

        {/* 2. 가전 담기 */}
        <section className="space-y-4">
          <p className="text-sm font-bold text-slate-900">② 쓰는 가전을 담아 보세요</p>

          <div ref={boxRef} className="relative">
            <label htmlFor="appliance-search" className="sr-only">
              가전 검색
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="appliance-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (matches[0]) addCatalog(matches[0]);
                    else if (query.trim()) addCustom();
                  }
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="가전 검색 (예: 에어컨, 냉장고, 전기장판, 플스)"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-teal-600"
              />
            </div>

            {open && q && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {matches.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => addCatalog(c)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-teal-50 cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-slate-900">{c.name}</span>
                    <span className="text-xs text-slate-500 font-mono-num whitespace-nowrap">
                      약 {c.watts.toLocaleString('ko-KR')}W · 하루 {c.hours}시간
                    </span>
                  </button>
                ))}

                {!exact && (
                  <div className="px-3.5 py-3 border-t border-slate-100 bg-slate-50 space-y-2">
                    <p className="text-xs text-slate-600">
                      {matches.length === 0 ? `‘${query.trim()}’은(는) 목록에 없어요.` : '찾는 제품이 없다면'} 이름과 소비전력(W)을 직접 넣어 담을 수 있어요.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        value={customWatts}
                        onChange={(e) => setCustomWatts(e.target.value)}
                        inputMode="decimal"
                        placeholder="소비전력 W"
                        aria-label="직접 담을 가전의 소비전력(W)"
                        className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-mono-num outline-none focus:border-teal-600"
                      />
                      <button
                        type="button"
                        onClick={addCustom}
                        className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 cursor-pointer"
                      >
                        ‘{query.trim()}’ 담기
                      </button>
                    </div>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${query.trim()} 소비전력`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
                    >
                      웹에서 ‘{query.trim()} 소비전력’ 찾아보기 <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((name) => {
              const c = CATALOG.find((x) => x.name === name);
              if (!c) return null;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => addCatalog(c)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border border-slate-300 bg-white text-slate-600 hover:border-teal-600 hover:text-teal-700 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  {name}
                </button>
              );
            })}
          </div>

          {rows.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('담은 가전을 모두 지울까요?')) setItems([]);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
              >
                모두 지우기
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 leading-relaxed text-center">
              아직 담은 가전이 없어요. 검색하거나 위 버튼을 눌러 담아 보세요. 여러 개를 담으면 한꺼번에 합산해 드려요.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map(({ it, kwh }) => {
                const m = perItem.get(it.id);
                const sv = saving.get(it.id);
                return (
                  <li
                    key={it.id}
                    className={`p-3 rounded-xl border transition-colors ${it.on ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={it.on}
                          onChange={(e) => patch(it.id, { on: e.target.checked })}
                          aria-label={`${it.name} 합계에 포함`}
                          className="w-4 h-4 accent-teal-700 shrink-0"
                        />
                        <span className="text-sm font-bold text-slate-900 truncate">{it.name}</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => patch(it.id, { qty: Math.max(1, it.qty - 1) })}
                          aria-label={`${it.name} 개수 줄이기`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-teal-600 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold font-mono-num">{it.qty}대</span>
                        <button
                          type="button"
                          onClick={() => patch(it.id, { qty: Math.min(20, it.qty + 1) })}
                          aria-label={`${it.name} 개수 늘리기`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:border-teal-600 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                          aria-label={`${it.name} 빼기`}
                          className="ml-1 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div role="group" aria-label={`${it.name} 입력 방식`} className="mt-2.5 inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
                      {(
                        [
                          ['watt', '소비전력 × 시간'],
                          ['label', '라벨의 월 kWh'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={it.mode === key}
                          onClick={() =>
                            // ‘라벨’ 방식으로 바꿀 때 값이 비어 0kWh가 되지 않도록 지금 계산값을 미리 채운다.
                            patch(
                              it.id,
                              key === 'label' && !it.monthKwh
                                ? { mode: key, monthKwh: ((num(it.watts) / 1000) * num(it.hours) * num(it.days)).toFixed(1) }
                                : { mode: key }
                            )
                          }
                          className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${it.mode === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {it.mode === 'watt' ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="text-[10px] text-slate-500">소비전력(W)</span>
                          <input className={field} inputMode="decimal" value={it.watts} onChange={(e) => patch(it.id, { watts: e.target.value })} />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-slate-500">하루 시간</span>
                          <input className={field} inputMode="decimal" value={it.hours} onChange={(e) => patch(it.id, { hours: e.target.value })} />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-slate-500">한 달 일수</span>
                          <input className={field} inputMode="decimal" value={it.days} onChange={(e) => patch(it.id, { days: e.target.value })} />
                        </label>
                      </div>
                    ) : (
                      <label className="block mt-2">
                        <span className="text-[10px] text-slate-500">월 소비전력량 (kWh) — 에너지소비효율 라벨이나 설명서의 값</span>
                        <input
                          className={field}
                          inputMode="decimal"
                          placeholder="예: 32"
                          value={it.monthKwh}
                          onChange={(e) => patch(it.id, { monthKwh: e.target.value })}
                        />
                      </label>
                    )}

                    <p className="mt-2 text-xs text-slate-600 font-mono-num text-right">
                      {kwh.toFixed(1)} kWh
                      {hasTotal && m !== undefined && (
                        <>
                          {' '}
                          · 이 가전 때문에 <b className="text-teal-800">약 {won(m)}원</b>
                        </>
                      )}
                    </p>
                    {hasTotal && it.on && sv !== undefined && sv > 0 && (
                      <p className="mt-1 text-[11px] text-emerald-700 text-right">하루 1시간 덜 쓰면 한 달 약 {won(sv)}원 아껴요</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. 결과 */}
        {rows.length > 0 && !hasTotal && (
          <p className="flex items-start gap-2 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              가전 사용량은 <b>{sumKwh.toFixed(1)} kWh</b>예요. 요금은 우리 집 <b>한 달 총 사용량</b>을 위 ①에 넣어야 정확히 계산돼요. 누진제 때문에 같은
              가전도 집마다 요금이 달라지거든요.
            </span>
          </p>
        )}

        {hasTotal && billAll && billWithout && marginalAll !== null && (
          <section className="space-y-3">
            <p className="text-sm font-bold text-slate-900">③ 계산 결과</p>

            {overTotal && (
              <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-snug">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                담은 가전의 사용량({sumKwh.toFixed(0)}kWh)이 우리 집 총 사용량({T.toFixed(0)}kWh)보다 커요. 시간이나 일수를 확인해 보세요.
              </p>
            )}

            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-teal-700">
                  선택한 {counted.length}개 가전이 만드는 한 달 요금{excludedCount > 0 ? ` (${excludedCount}개 뺌)` : ''}
                </p>
                <p className="text-2xl font-bold text-teal-900 font-mono-num whitespace-nowrap">약 {won(marginalAll)}원</p>
                <p className="text-xs text-teal-800 font-mono-num">
                  {sumKwh.toFixed(1)} kWh · 가전 없이 지냈다면 청구액 {won(billWithout.total)}원 → 지금 {won(billAll.total)}원
                </p>
                {sumKwh > 0 && (
                  <p className="text-[11px] text-teal-700 mt-1">
                    누진제를 반영하면 이 가전들의 실제 kWh당 요금은 평균 {Math.round(marginalAll / sumKwh).toLocaleString('ko-KR')}원이에요.
                  </p>
                )}
              </div>

              {counted.length > 1 && sumKwh > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-teal-700">
                    {top && (
                      <>
                        가장 전기를 많이 쓰는 건 <b>{top.it.name}</b> ({((top.kwh / sumKwh) * 100).toFixed(0)}%)
                      </>
                    )}
                  </p>
                  {[...counted]
                    .sort((a, b) => b.kwh - a.kwh)
                    .map((r) => (
                      <div key={r.it.id} className="flex items-center gap-2 text-[11px]">
                        <span className="w-24 truncate text-slate-700">
                          {r.it.name}
                          {r.it.qty > 1 ? ` ×${r.it.qty}` : ''}
                        </span>
                        <span className="flex-1 h-2 rounded-full bg-white overflow-hidden">
                          <span className="block h-full rounded-full bg-teal-600" style={{ width: `${(r.kwh / sumKwh) * 100}%` }} />
                        </span>
                        <span className="w-9 text-right font-mono-num text-slate-700">{((r.kwh / sumKwh) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 구간 안내 */}
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <p>
                우리 집은 지금 <b className="text-teal-800">{billAll.tier}구간</b>이에요 ({billAll.limits[0]}·{billAll.limits[1]}kWh 기준
                {hasSuperUser(month) ? ', 1,000kWh를 넘으면 슈퍼유저 요금' : ''}).
              </p>
              {next ? (
                <p className="mt-1">
                  <b>{next.kwh.toFixed(0)}kWh</b>만 더 쓰면 {next.tier}구간이에요. 기본요금이 <b>{won(next.base)}원</b> 오르고, 넘는 만큼은 kWh당{' '}
                  <b>{next.rate.toFixed(1)}원</b>이 붙어요.
                </p>
              ) : (
                <p className="mt-1">가장 높은 구간이에요. 더 쓰는 전기는 kWh당 가장 비싼 단가로 계산돼요.</p>
              )}
            </div>

            {/* 청구서 */}
            <details className="group rounded-xl border border-slate-200 bg-white">
              <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs font-semibold text-teal-800">
                <span>우리 집 예상 청구서 자세히 보기 ({T.toFixed(0)}kWh)</span>
                <span className="text-slate-400 group-open:rotate-90 transition-transform" aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 text-xs">
                <dl className="space-y-1 font-mono-num">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">기본요금 ({billAll.tier}구간)</dt>
                    <dd className="text-slate-900">{won(billAll.base)}원</dd>
                  </div>
                  {billAll.energyLines.map((l) => (
                    <div key={l.label} className="flex justify-between gap-3 text-[11px]">
                      <dt className="text-slate-500">
                        전력량 · {l.label} {l.kwh.toFixed(0)}kWh × {l.rate.toFixed(1)}
                      </dt>
                      <dd className="text-slate-700 whitespace-nowrap">{won(l.won)}원</dd>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <dt className="text-slate-600">전력량요금 합계</dt>
                    <dd className="text-slate-900">{won(billAll.energy)}원</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">기후환경요금 ({rates.climate}원/kWh)</dt>
                    <dd className="text-slate-900">{won(billAll.climate)}원</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">연료비조정요금 ({rates.fuel}원/kWh)</dt>
                    <dd className="text-slate-900">{won(billAll.fuel)}원</dd>
                  </div>
                  {billAll.discount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">할인</dt>
                      <dd className="text-slate-900">− {won(billAll.discount)}원</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-100 pt-1">
                    <dt className="font-semibold text-slate-700">전기요금계</dt>
                    <dd className="font-semibold text-slate-900">{won(billAll.subtotal)}원</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">부가가치세 (10%)</dt>
                    <dd className="text-slate-900">{won(billAll.vat)}원</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">전력산업기반기금 ({(rates.fundRate * 100).toFixed(1)}%)</dt>
                    <dd className="text-slate-900">{won(billAll.fund)}원</dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm">
                    <dt className="font-bold text-teal-900">청구금액</dt>
                    <dd className="font-bold text-teal-900">{won(billAll.total)}원</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-slate-400 leading-snug">TV수신료는 포함하지 않았어요. 복지·대가족·자동이체 할인은 ‘고지서에 맞추기’에 할인액을 넣으면 반영돼요.</p>
              </div>
            </details>
          </section>
        )}

        {/* 4. 근거와 고지서 맞추기 */}
        <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
          <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs font-semibold text-slate-700">
            <span>계산 근거와 고지서에 맞추기</span>
            <span className="text-slate-400 group-open:rotate-90 transition-transform" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-200 space-y-3">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              고지서의 항목 단가가 아래와 다르면 직접 고쳐 보세요. 바꾸면 위 계산이 바로 달라져요.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="block">
                <span className="text-[10px] text-slate-500">기후환경요금 (원/kWh)</span>
                <input className={field} inputMode="decimal" value={climate} onChange={(e) => setClimate(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-500">연료비조정 (원/kWh)</span>
                <input className={field} inputMode="decimal" value={fuel} onChange={(e) => setFuel(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-500">전력기금 (%)</span>
                <input className={field} inputMode="decimal" value={fundPct} onChange={(e) => setFundPct(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-500">할인액 (원/월)</span>
                <input className={field} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </label>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              할인액은 고지서의 ‘복지할인’ 등 금액이에요. 한전 계산 순서대로 전기요금계에서 뺀 뒤 세금·기금을 계산해요. 할인이 사용량에 비례하는 종류(예: 30%)라면 가전의
              요금도 그만큼 줄어드는데, 여기서는 고정 금액으로만 반영해요.
            </p>
            {ratesChanged && (
              <button
                type="button"
                onClick={() => {
                  setClimate(String(DEFAULT_RATES.climate));
                  setFuel(String(DEFAULT_RATES.fuel));
                  setFundPct(String(DEFAULT_RATES.fundRate * 100));
                  setDiscount('0');
                }}
                className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                기본값으로 되돌리기
              </button>
            )}

            <ul className="space-y-1.5 text-[11px] text-slate-600 leading-relaxed list-disc pl-4">
              <li>
                기본요금·구간별 단가·슈퍼유저 요금:{' '}
                <a className="text-teal-700 underline" href="https://cyber.kepco.co.kr/ckepco/front/jsp/CY/E/E/CYEEHP00101.jsp" target="_blank" rel="noopener noreferrer">
                  한국전력 전기요금표(주택용)
                </a>{' '}
                2023.11.9 시행표. 2026.11.18에 확인했어요.
              </li>
              <li>
                전력산업기반기금 2.7%:{' '}
                <a className="text-teal-700 underline" href="https://www.korea.kr/news/policyNewsView.do?newsId=148929635" target="_blank" rel="noopener noreferrer">
                  정부 정책브리핑(2024.5.28)
                </a>
                의 단계 인하(3.7→3.2→2.7%) 일정. 한전 계산기 안내문에는 옛 3.7%가 남아 있어요.
              </li>
              <li>연료비조정 +5원/kWh: 2026년 4분기 전기요금 동결 보도(한전 2026.9.21 발표). 분기마다 바뀔 수 있어요.</li>
              <li>
                <b>기후환경요금 9.0원/kWh는 한전 공식 문서로는 확인하지 못했어요.</b> 여러 2차 자료의 2026년 값이라, 고지서의 값과 다르면 위에서 고쳐 주세요.
              </li>
              <li>
                복지·대가족(5인 이상, 3자녀 이상, 출산가구) 할인은 정부 안내(2021.3, 월 30%·1만 6천 원 한도)로 존재만 확인했고 현재 한도와 적용 방식은 확인하지 못해서, 고지서의 할인액을 직접
                넣게 했어요.
              </li>
              <li>넣지 않은 것: TV수신료, 검침 기간이 두 달에 걸칠 때의 일할 계산(7~8월 경계 등).</li>
            </ul>
          </div>
        </details>

        <p className="text-[11px] text-slate-400 leading-snug">
          가전의 W와 시간은 대략적인 평균 예시라서 제품 라벨에 맞게 고쳐 쓰세요. 체크를 풀면 그 가전을 합계에서 빼고, 휴지통은 목록에서 지워요. 결과는 예상 금액이며
          실제 청구서와 다를 수 있어요. 입력한 내용은 이 기기의 브라우저에만 저장돼요.
        </p>
      </div>
    </div>
  );
};
