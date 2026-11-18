export const INVALID_FILE_ERROR_MESSAGE = '한국전력거래소 CSV 파일을 올려 주세요';

export interface DemandDataset {
  fileName: string;
  points: Map<string, number>;
  rowCount: number;
}

export interface SolarDataset {
  fileName: string;
  points: Map<string, number>;
  totalRows: number;
  solarRows: number;
}

export interface MatchedPoint {
  key: string;
  date: string;
  hour: number;
  dayOfWeek: string;
  demand: number;
  solar: number;
  netLoad: number;
}

export interface HourlyAverage {
  hour: number;
  avgDemand: number;
  avgSolar: number;
  avgNetLoad: number;
  count: number;
}

export interface AnalysisResult {
  minDemand: MatchedPoint;
  minNetLoad: MatchedPoint;
  periodStart: string;
  periodEnd: string;
  matchedDateCount: number;
  matchedPointCount: number;
  demandOnlyCount: number;
  solarOnlyCount: number;
  excludedCount: number;
  matchedMap: Map<string, MatchedPoint>;
  availableDates: string[];
  hourlyAverages: HourlyAverage[];
}

const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function getKoreanDayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return KOREAN_DAYS[utcDay] ?? '';
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) {
    return line.split(',').map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function decodeBuffer(buffer: ArrayBuffer, encoding: 'euc-kr' | 'utf-8'): string {
  const decoder = new TextDecoder(encoding);
  return decoder.decode(buffer).replace(/^\uFEFF/, '');
}

function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseNumberStrict(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') {
    return null;
  }
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '') {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function tryParseDemandLines(lines: string[], fileName: string): DemandDataset | null {
  if (lines.length < 2) {
    return null;
  }

  const header = parseCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => h === '날짜');
  if (dateIdx === -1) {
    return null;
  }

  const hourColMap = new Map<number, number>();
  for (let h = 1; h <= 24; h++) {
    const colIdx = header.findIndex((col) => col === `${h}시`);
    if (colIdx === -1) {
      return null;
    }
    hourColMap.set(h, colIdx);
  }

  const points = new Map<string, number>();
  let validRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateVal = row[dateIdx]?.trim();
    if (!dateVal || !isValidIsoDate(dateVal)) {
      continue;
    }

    let rowHasNumeric = false;
    for (let h = 1; h <= 24; h++) {
      const colIdx = hourColMap.get(h)!;
      const num = parseNumberStrict(row[colIdx]);
      if (num !== null) {
        points.set(`${dateVal}|${h}`, num);
        rowHasNumeric = true;
      }
    }

    if (rowHasNumeric) {
      validRows++;
    }
  }

  if (validRows === 0 || points.size === 0) {
    return null;
  }

  return {
    fileName,
    points,
    rowCount: validRows,
  };
}

function tryParseSolarLines(lines: string[], fileName: string): SolarDataset | null {
  if (lines.length < 2) {
    return null;
  }

  const header = parseCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => h === '거래일');
  const hourIdx = header.findIndex((h) => h === '거래시간');
  const regionIdx = header.findIndex((h) => h === '지역');
  const fuelIdx = header.findIndex((h) => h === '연료원');
  const valueIdx = header.findIndex(
    (h) => h === '전력거래량(MWh)' || h.startsWith('전력거래량')
  );

  if (
    dateIdx === -1 ||
    hourIdx === -1 ||
    regionIdx === -1 ||
    fuelIdx === -1 ||
    valueIdx === -1
  ) {
    return null;
  }

  const points = new Map<string, number>();
  let totalRows = 0;
  let solarRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateVal = row[dateIdx]?.trim();
    const hourRaw = row[hourIdx]?.trim();
    const fuelVal = row[fuelIdx]?.trim();
    const val = parseNumberStrict(row[valueIdx]);

    if (!dateVal || !isValidIsoDate(dateVal) || !hourRaw || val === null) {
      continue;
    }

    const hourNum = Number(hourRaw);
    if (!Number.isInteger(hourNum) || hourNum < 1 || hourNum > 24) {
      continue;
    }

    totalRows++;

    if (fuelVal === '태양광') {
      const key = `${dateVal}|${hourNum}`;
      points.set(key, (points.get(key) ?? 0) + val);
      solarRows++;
    }
  }

  if (totalRows === 0 || solarRows === 0 || points.size === 0) {
    return null;
  }

  return {
    fileName,
    points,
    totalRows,
    solarRows,
  };
}

export async function parseDemandCsv(file: File): Promise<DemandDataset> {
  if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
    throw new Error(INVALID_FILE_ERROR_MESSAGE);
  }

  const buffer = await file.arrayBuffer();
  const eucKrLines = splitNonEmptyLines(decodeBuffer(buffer, 'euc-kr'));
  const eucKrParsed = tryParseDemandLines(eucKrLines, file.name);
  if (eucKrParsed) {
    return eucKrParsed;
  }

  const utf8Lines = splitNonEmptyLines(decodeBuffer(buffer, 'utf-8'));
  const utf8Parsed = tryParseDemandLines(utf8Lines, file.name);
  if (utf8Parsed) {
    return utf8Parsed;
  }

  throw new Error(INVALID_FILE_ERROR_MESSAGE);
}

export async function parseSolarCsv(file: File): Promise<SolarDataset> {
  if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
    throw new Error(INVALID_FILE_ERROR_MESSAGE);
  }

  const buffer = await file.arrayBuffer();
  const eucKrLines = splitNonEmptyLines(decodeBuffer(buffer, 'euc-kr'));
  const eucKrParsed = tryParseSolarLines(eucKrLines, file.name);
  if (eucKrParsed) {
    return eucKrParsed;
  }

  const utf8Lines = splitNonEmptyLines(decodeBuffer(buffer, 'utf-8'));
  const utf8Parsed = tryParseSolarLines(utf8Lines, file.name);
  if (utf8Parsed) {
    return utf8Parsed;
  }

  throw new Error(INVALID_FILE_ERROR_MESSAGE);
}

export function analyzeGridData(
  demandData: DemandDataset,
  solarData: SolarDataset
): AnalysisResult {
  const matchedMap = new Map<string, MatchedPoint>();
  const matchedDatesSet = new Set<string>();

  let demandOnlyCount = 0;
  let solarOnlyCount = 0;

  let minDemand: MatchedPoint | null = null;
  let minNetLoad: MatchedPoint | null = null;

  const hourBuckets = Array.from({ length: 24 }, (_, idx) => ({
    hour: idx + 1,
    sumDemand: 0,
    sumSolar: 0,
    sumNetLoad: 0,
    count: 0,
  }));

  for (const [key, demandVal] of demandData.points.entries()) {
    const solarVal = solarData.points.get(key);
    if (solarVal === undefined) {
      demandOnlyCount++;
      continue;
    }

    const sepIdx = key.indexOf('|');
    const date = key.slice(0, sepIdx);
    const hour = Number(key.slice(sepIdx + 1));
    const netLoad = demandVal - solarVal;
    const dayOfWeek = getKoreanDayOfWeek(date);

    const point: MatchedPoint = {
      key,
      date,
      hour,
      dayOfWeek,
      demand: demandVal,
      solar: solarVal,
      netLoad,
    };

    matchedMap.set(key, point);
    matchedDatesSet.add(date);

    if (!minDemand || point.demand < minDemand.demand) {
      minDemand = point;
    }
    if (!minNetLoad || point.netLoad < minNetLoad.netLoad) {
      minNetLoad = point;
    }

    const bucket = hourBuckets[hour - 1];
    if (bucket) {
      bucket.sumDemand += demandVal;
      bucket.sumSolar += solarVal;
      bucket.sumNetLoad += netLoad;
      bucket.count++;
    }
  }

  for (const key of solarData.points.keys()) {
    if (!demandData.points.has(key)) {
      solarOnlyCount++;
    }
  }

  if (matchedMap.size === 0 || !minDemand || !minNetLoad) {
    throw new Error(INVALID_FILE_ERROR_MESSAGE);
  }

  const availableDates = Array.from(matchedDatesSet).sort();
  const periodStart = availableDates[0];
  const periodEnd = availableDates[availableDates.length - 1];

  const hourlyAverages: HourlyAverage[] = hourBuckets.map((b) => ({
    hour: b.hour,
    avgDemand: b.count > 0 ? b.sumDemand / b.count : 0,
    avgSolar: b.count > 0 ? b.sumSolar / b.count : 0,
    avgNetLoad: b.count > 0 ? b.sumNetLoad / b.count : 0,
    count: b.count,
  }));

  return {
    minDemand,
    minNetLoad,
    periodStart,
    periodEnd,
    matchedDateCount: availableDates.length,
    matchedPointCount: matchedMap.size,
    demandOnlyCount,
    solarOnlyCount,
    excludedCount: demandOnlyCount + solarOnlyCount,
    matchedMap,
    availableDates,
    hourlyAverages,
  };
}

export interface SeasonalStats {
  season: 'spring' | 'autumn';
  hourlyAverages: HourlyAverage[];
  daytimeMinNetLoad: {
    value: number;
    hour: number;
  };
  eveningPeakNetLoad: {
    value: number;
    hour: number;
  };
  eveningRamp: number;
  recordLowPoint: MatchedPoint;
}

export interface SeasonalComparisonResult {
  spring: SeasonalStats | null;
  autumn: SeasonalStats | null;
}

function buildSeasonalStats(
  points: MatchedPoint[],
  season: 'spring' | 'autumn',
  dayRange: [number, number],
  eveningRange: [number, number]
): SeasonalStats | null {
  if (points.length === 0) {
    return null;
  }

  const buckets = Array.from({ length: 24 }, (_, idx) => ({
    hour: idx + 1,
    sumDemand: 0,
    sumSolar: 0,
    sumNetLoad: 0,
    count: 0,
  }));

  let recordLowPoint: MatchedPoint = points[0];

  for (const pt of points) {
    if (pt.netLoad < recordLowPoint.netLoad) {
      recordLowPoint = pt;
    }
    const bucket = buckets[pt.hour - 1];
    if (bucket) {
      bucket.sumDemand += pt.demand;
      bucket.sumSolar += pt.solar;
      bucket.sumNetLoad += pt.netLoad;
      bucket.count++;
    }
  }

  const hourlyAverages: HourlyAverage[] = buckets.map((b) => ({
    hour: b.hour,
    avgDemand: b.count > 0 ? b.sumDemand / b.count : 0,
    avgSolar: b.count > 0 ? b.sumSolar / b.count : 0,
    avgNetLoad: b.count > 0 ? b.sumNetLoad / b.count : 0,
    count: b.count,
  }));

  const [dayStart, dayEnd] = dayRange;
  const daytimeHours = hourlyAverages.filter(
    (h) => h.hour >= dayStart && h.hour <= dayEnd && h.count > 0
  );
  if (daytimeHours.length === 0) {
    return null;
  }
  const minDaytime = daytimeHours.reduce((best, curr) =>
    curr.avgNetLoad < best.avgNetLoad ? curr : best
  );

  const [eveningStart, eveningEnd] = eveningRange;
  const eveningHours = hourlyAverages.filter(
    (h) => h.hour >= eveningStart && h.hour <= eveningEnd && h.count > 0
  );
  if (eveningHours.length === 0) {
    return null;
  }
  const maxEvening = eveningHours.reduce((best, curr) =>
    curr.avgNetLoad > best.avgNetLoad ? curr : best
  );

  return {
    season,
    hourlyAverages,
    daytimeMinNetLoad: {
      value: minDaytime.avgNetLoad,
      hour: minDaytime.hour,
    },
    eveningPeakNetLoad: {
      value: maxEvening.avgNetLoad,
      hour: maxEvening.hour,
    },
    eveningRamp: maxEvening.avgNetLoad - minDaytime.avgNetLoad,
    recordLowPoint,
  };
}

export function computeSeasonalComparison(
  analysis: AnalysisResult,
  dayRange: [number, number] = [11, 15],
  eveningRange: [number, number] = [18, 20]
): SeasonalComparisonResult {
  const springPoints: MatchedPoint[] = [];
  const autumnPoints: MatchedPoint[] = [];

  for (const pt of analysis.matchedMap.values()) {
    const month = Number(pt.date.slice(5, 7));
    if (month >= 3 && month <= 5) {
      springPoints.push(pt);
    } else if (month >= 9 && month <= 11) {
      autumnPoints.push(pt);
    }
  }

  return {
    spring: buildSeasonalStats(springPoints, 'spring', dayRange, eveningRange),
    autumn: buildSeasonalStats(autumnPoints, 'autumn', dayRange, eveningRange),
  };
}

export const TARGET_FUELS = [
  '원자력',
  '유연탄',
  'LNG',
  '양수',
  '태양광',
  '풍력',
] as const;

export type FuelType = (typeof TARGET_FUELS)[number];

const TARGET_FUEL_SET = new Set<string>(TARGET_FUELS);

export type FuelValuesRecord = Record<FuelType, number | null>;

export interface FuelGenerationDataset {
  fileName: string;
  points: Map<string, FuelValuesRecord>;
  totalRows: number;
  matchedFuelRows: number;
}

export interface FuelHourlyAverage {
  hour: number;
  values: Record<FuelType, number | null>;
}

function createEmptyFuelRecord(): FuelValuesRecord {
  return {
    원자력: null,
    유연탄: null,
    LNG: null,
    양수: null,
    태양광: null,
    풍력: null,
  };
}

function tryParseGenerationByFuelLines(
  lines: string[],
  fileName: string
): FuelGenerationDataset | null {
  if (lines.length < 2) {
    return null;
  }

  const header = parseCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => h === '거래일자');
  const hourIdx = header.findIndex((h) => h === '거래시간');
  const fuelIdx = header.findIndex((h) => h === '연료원별');
  const capacityIdx = header.findIndex(
    (h) => h === '설비용량(MW)' || h.startsWith('설비용량')
  );
  const valueIdx = header.findIndex(
    (h) => h === '전력거래량(MWh)' || h.startsWith('전력거래량')
  );

  if (
    dateIdx === -1 ||
    hourIdx === -1 ||
    fuelIdx === -1 ||
    capacityIdx === -1 ||
    valueIdx === -1
  ) {
    return null;
  }

  const points = new Map<string, FuelValuesRecord>();
  let totalRows = 0;
  let matchedFuelRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateVal = row[dateIdx]?.trim();
    const hourRaw = row[hourIdx]?.trim();
    const fuelVal = row[fuelIdx]?.trim();
    const val = parseNumberStrict(row[valueIdx]);

    if (!dateVal || !isValidIsoDate(dateVal) || !hourRaw || val === null) {
      continue;
    }

    const hourNum = Number(hourRaw);
    if (!Number.isInteger(hourNum) || hourNum < 1 || hourNum > 24) {
      continue;
    }

    totalRows++;

    if (fuelVal && TARGET_FUEL_SET.has(fuelVal)) {
      const typedFuel = fuelVal as FuelType;
      const key = `${dateVal}|${hourNum}`;
      let rec = points.get(key);
      if (!rec) {
        rec = createEmptyFuelRecord();
        points.set(key, rec);
      }
      rec[typedFuel] = (rec[typedFuel] ?? 0) + val;
      matchedFuelRows++;
    }
  }

  if (totalRows === 0 || matchedFuelRows === 0 || points.size === 0) {
    return null;
  }

  return {
    fileName,
    points,
    totalRows,
    matchedFuelRows,
  };
}

export async function parseGenerationByFuelCsv(
  file: File
): Promise<FuelGenerationDataset> {
  if (
    !file.name.toLowerCase().endsWith('.csv') &&
    file.type &&
    !file.type.includes('csv') &&
    !file.type.includes('text')
  ) {
    throw new Error(INVALID_FILE_ERROR_MESSAGE);
  }

  const buffer = await file.arrayBuffer();
  const eucKrLines = splitNonEmptyLines(decodeBuffer(buffer, 'euc-kr'));
  const eucKrParsed = tryParseGenerationByFuelLines(eucKrLines, file.name);
  if (eucKrParsed) {
    return eucKrParsed;
  }

  const utf8Lines = splitNonEmptyLines(decodeBuffer(buffer, 'utf-8'));
  const utf8Parsed = tryParseGenerationByFuelLines(utf8Lines, file.name);
  if (utf8Parsed) {
    return utf8Parsed;
  }

  throw new Error(INVALID_FILE_ERROR_MESSAGE);
}

export function computeFuelAnnualHourlyAverages(
  fuelDataset: FuelGenerationDataset
): FuelHourlyAverage[] {
  const sums = Array.from({ length: 24 }, () => ({
    원자력: { sum: 0, count: 0 },
    유연탄: { sum: 0, count: 0 },
    LNG: { sum: 0, count: 0 },
    양수: { sum: 0, count: 0 },
    태양광: { sum: 0, count: 0 },
    풍력: { sum: 0, count: 0 },
  }));

  for (const [key, rec] of fuelDataset.points.entries()) {
    const sepIdx = key.indexOf('|');
    const hour = Number(key.slice(sepIdx + 1));
    const bucket = sums[hour - 1];
    if (!bucket) continue;

    for (const fuel of TARGET_FUELS) {
      const val = rec[fuel];
      if (val !== null) {
        bucket[fuel].sum += val;
        bucket[fuel].count++;
      }
    }
  }

  return sums.map((bucket, idx) => {
    const values = createEmptyFuelRecord();
    for (const fuel of TARGET_FUELS) {
      values[fuel] =
        bucket[fuel].count > 0 ? bucket[fuel].sum / bucket[fuel].count : null;
    }
    return {
      hour: idx + 1,
      values,
    };
  });
}

export type KoreanSeason = '봄' | '여름' | '가을' | '겨울';

export function getKoreanSeason(dateStr: string): KoreanSeason {
  const month = Number(dateStr.slice(5, 7));
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

export function isSpringWeekend(dateStr: string, dayOfWeek: string): boolean {
  const month = Number(dateStr.slice(5, 7));
  const isSpring = month >= 3 && month <= 5;
  const isWeekend = dayOfWeek === '토' || dayOfWeek === '일';
  return isSpring && isWeekend;
}

export interface HourlyMinDemandStat {
  hour: number;
  point: MatchedPoint | null;
  season: KoreanSeason | null;
  isSpringWeekend: boolean;
}

export function computeHourlyMinDemandStats(
  analysis: AnalysisResult
): HourlyMinDemandStat[] {
  const minByHour: (MatchedPoint | null)[] = Array.from(
    { length: 24 },
    () => null
  );

  for (const pt of analysis.matchedMap.values()) {
    const idx = pt.hour - 1;
    if (idx < 0 || idx >= 24) continue;
    const prev = minByHour[idx];
    if (!prev || pt.demand < prev.demand) {
      minByHour[idx] = pt;
    }
  }

  return minByHour.map((pt, idx) => ({
    hour: idx + 1,
    point: pt,
    season: pt ? getKoreanSeason(pt.date) : null,
    isSpringWeekend: pt ? isSpringWeekend(pt.date, pt.dayOfWeek) : false,
  }));
}
