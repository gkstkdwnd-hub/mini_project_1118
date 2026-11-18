import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * 덕 커브 설명용 자체 제작 일러스트.
 * 수요(점선) − 태양광(노랑) = 순부하(주황)가 오리 옆모습이 되는 과정을 한 장에 담는다.
 * 숫자는 이해를 돕기 위한 예시 곡선이며 실제 데이터가 아니다.
 */

const X0 = 30;
const X_PER_HOUR = 12.8;
const BASE_Y = 185;
const Y_PER_UNIT = 1.35;

// [시, 수요, 태양광] — 상대 크기(0~100)
const SAMPLE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 52, 0],
  [3, 46, 0],
  [6, 55, 0],
  [8, 70, 10],
  [10, 78, 36],
  [12, 80, 52],
  [14, 80, 52],
  [16, 82, 36],
  [17, 86, 20],
  [18, 92, 6],
  [19, 100, 0],
  [20, 96, 0],
  [22, 78, 0],
  [24, 60, 0],
];

type Pt = readonly [number, number];

const px = (hour: number) => X0 + hour * X_PER_HOUR;
const py = (value: number) => BASE_Y - value * Y_PER_UNIT;

const demandPts: Pt[] = SAMPLE.map(([h, d]) => [px(h), py(d)]);
const netPts: Pt[] = SAMPLE.map(([h, d, s]) => [px(h), py(d - s)]);

/** Catmull-Rom 스플라인을 3차 베지어 경로로 바꾼다. */
function smooth(pts: readonly Pt[], moveTo = true): string {
  if (pts.length < 2) return '';
  let d = moveTo
    ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
    : `L${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// 태양광이 있는 구간(6시~19시)만 잘라 노란 영역을 만든다.
const solarFrom = SAMPLE.findIndex(([, , s]) => s > 0) - 1;
const solarTo = SAMPLE.findIndex(([h]) => h === 19);
const solarArea =
  smooth(demandPts.slice(solarFrom, solarTo + 1)) +
  smooth(netPts.slice(solarFrom, solarTo + 1).reverse(), false) +
  'Z';

const netLine = smooth(netPts);
const demandLine = smooth(demandPts);
const bodyArea = `${netLine}L${px(24)},${BASE_Y}L${X0},${BASE_Y}Z`;

const peak = netPts[solarTo]; // 저녁 19시 정점 = 오리 머리
const belly = netPts.find((_, i) => SAMPLE[i][0] === 13) ?? netPts[5];

const HOUR_TICKS = [0, 6, 12, 18, 24];

interface DuckCurveIllustrationProps {
  /** 0~24. 값을 주면 그 시각의 위치를 곡선 위에 표시한다. */
  markerHour?: number;
  /** 마커를 눌러 움직일 수 있게 할 때 쓴다. 값은 0~24 시각. */
  onMarkerChange?: (hour: number) => void;
  /**
   * demand: 태양광을 빼기 전, 사람들이 쓰는 전기(전력수요)만 보여 준다.
   * duck: 수요에서 태양광을 뺀 순부하가 오리 모양이 되는 그림 (기본값).
   */
  stage?: "demand" | "duck";
}

export const DuckCurveIllustration: React.FC<DuckCurveIllustrationProps> = ({
  markerHour,
  onMarkerChange,
  stage = "duck",
}) => {
  const netRef = useRef<SVGPathElement | null>(null);
  const demandRef = useRef<SVGPathElement | null>(null);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);

  // 곡선 위에서 해당 시각(x)에 맞는 점을 찾는다. 곡선의 x가 시간순이라 이분 탐색으로 충분하다.
  useLayoutEffect(() => {
    const path = stage === "demand" ? demandRef.current : netRef.current;
    if (markerHour === undefined || !path) {
      setMarker(null);
      return;
    }
    const targetX = px(Math.min(24, Math.max(0, markerHour)));
    let lo = 0;
    let hi = path.getTotalLength();
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).x < targetX) lo = mid;
      else hi = mid;
    }
    const p = path.getPointAtLength((lo + hi) / 2);
    setMarker({ x: p.x, y: p.y });
  }, [markerHour, stage]);

  const headX = peak[0] - 3;
  const headY = peak[1] - 9;

  // 그림 위를 누르거나 끌면 그 시각을 바깥에 알린다. 세로 스크롤은 그대로 두려고 touch-action을 pan-y로 둔다.
  const pickHour = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onMarkerChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 360;
    onMarkerChange(Math.min(24, Math.max(0, Math.round((x - X0) / X_PER_HOUR))));
  };

  return (
    <svg
      viewBox="0 0 360 236"
      className={`w-full h-auto select-none ${onMarkerChange ? 'cursor-ew-resize' : ''}`}
      style={onMarkerChange ? { touchAction: 'pan-y' } : undefined}
      onPointerDown={(e) => {
        if (!onMarkerChange) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pickHour(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1 || e.pointerType === 'touch') pickHour(e);
      }}
      role="img"
      aria-label="하루 동안 전력수요에서 태양광 발전량을 빼면 순부하 곡선이 오리 모양이 된다는 것을 보여주는 그림"
    >
      <defs>
        <linearGradient id="dc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.55" stopColor="#f0fdfa" />
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
        <linearGradient id="dc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <linearGradient id="dc-demand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id="dc-solar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="dc-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="0.6" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <style>{`
          @keyframes dc-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes dc-pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
          .dc-draw { stroke-dasharray: 1; stroke-dashoffset: 0; animation: dc-draw 1.6s ease-out both; }
          .dc-pop { animation: dc-pop .5s ease-out 1.4s both; }
          @media (prefers-reduced-motion: reduce) { .dc-draw, .dc-pop { animation: none; } }
        `}</style>
      </defs>

      {/* 배경 */}
      <rect x="0" y="0" width="360" height="236" rx="14" fill="url(#dc-sky)" />

      {/* 해 */}
      {stage === "duck" && (
      <g>
        <circle cx={px(12)} cy="30" r="22" fill="url(#dc-sun)" />
        <circle cx={px(12)} cy="30" r="9" fill="#f59e0b" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={px(12) + Math.cos(a) * 13}
              y1={30 + Math.sin(a) * 13}
              x2={px(12) + Math.cos(a) * 18}
              y2={30 + Math.sin(a) * 18}
              stroke="#f59e0b"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          );
        })}
      </g>
      )}

      {/* 눈금선 */}
      {HOUR_TICKS.map((h) => (
        <g key={h}>
          <line x1={px(h)} y1="46" x2={px(h)} y2={BASE_Y} stroke="#94a3b8" strokeOpacity="0.25" strokeDasharray="2 4" />
          <text x={px(h)} y={BASE_Y + 13} fontSize="8.5" fill="#64748b" textAnchor="middle">
            {h}시
          </text>
        </g>
      ))}

      {stage === "demand" && (
        <g>
          <path d={`${demandLine}L${px(24)},${BASE_Y}L${X0},${BASE_Y}Z`} fill="url(#dc-demand)" />
          <path
            ref={demandRef}
            d={demandLine}
            pathLength={1}
            className="dc-draw"
            fill="none"
            stroke="#0f766e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g fontSize="9.5" fontWeight="700" textAnchor="middle" fill="#f0fdfa">
            <text x={px(3)} y={BASE_Y - 14}>밤: 적게</text>
            <text x={px(13)} y={BASE_Y - 14}>낮: 많이 씀</text>
            <text x={px(19.5)} y={BASE_Y - 14}>저녁: 다시 늘어요</text>
          </g>
        </g>
      )}

      {stage === "duck" && (
      <>
      {/* 태양광 영역 */}
      <path d={solarArea} fill="url(#dc-solar)" />
      <text x={px(12.5)} y={py(66)} fontSize="9" fontWeight="700" fill="#92400e" textAnchor="middle">
        태양광 발전
      </text>

      {/* 오리 몸통 */}
      <path d={bodyArea} fill="url(#dc-body)" />

      {/* 꼬리 깃 */}
      <path
        d={`M${X0 + 1},${netPts[0][1]}L${X0 - 13},${netPts[0][1] - 13}L${X0 - 4},${netPts[0][1] + 3}Z`}
        fill="#ea580c"
      />

      {/* 수요(점선) */}
      <path d={demandLine} fill="none" stroke="#475569" strokeWidth="1.6" strokeDasharray="4 3" strokeLinecap="round" />

      {/* 순부하(주황) */}
      <path
        ref={netRef}
        d={netLine}
        pathLength={1}
        className="dc-draw"
        fill="none"
        stroke="#9a3412"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 오리 머리 */}
      <g className="dc-pop">
        <circle cx={headX} cy={headY} r="11" fill="#ea580c" stroke="#9a3412" strokeWidth="2" />
        <path d={`M${headX + 9},${headY - 1}L${headX + 22},${headY + 3}L${headX + 9},${headY + 7}Z`} fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx={headX + 3} cy={headY - 3} r="2.6" fill="#fff" />
        <circle cx={headX + 3.8} cy={headY - 3} r="1.3" fill="#1e293b" />
        <path d={`M${headX - 4},${headY - 10}q3,-6 7,-2`} fill="none" stroke="#9a3412" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* 설명 라벨 */}
      <g fontSize="9.5" fontWeight="700" textAnchor="middle">
        <text x={belly[0]} y={BASE_Y - 14} fill="#fff7ed">
          배 · 낮
        </text>
        <text x={belly[0]} y={BASE_Y - 3} fontSize="7.5" fontWeight="500" fill="#ffedd5">
          태양광 ↑ → 순부하 ↓
        </text>
        <text x={headX} y={headY - 16} fill="#9a3412">
          머리 · 저녁 정점
        </text>
        <text x={px(2.2)} y={py(16)} fill="#fff7ed" fontSize="8.5">
          밤
        </text>
      </g>
      <g className="dc-pop">
        <rect x={px(16.1)} y={BASE_Y - 34} width="54" height="15" rx="7.5" fill="#fff" fillOpacity="0.95" stroke="#c2410c" strokeWidth="1" />
        <text x={px(16.1) + 27} y={BASE_Y - 23.5} fontSize="8.5" fontWeight="700" fill="#9a3412" textAnchor="middle">
          목 · 급상승 ↑
        </text>
      </g>
      </>
      )}

      {/* 선택한 시각 표시 */}
      {marker && markerHour !== undefined && (
        <g pointerEvents="none">
          <line x1={marker.x} y1="44" x2={marker.x} y2={BASE_Y} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx={marker.x} cy={marker.y} r="7" fill="#fff" stroke="#0f766e" strokeWidth="2.5" />
          <circle cx={marker.x} cy={marker.y} r="2.5" fill="#0f766e" />
          <rect x={Math.min(Math.max(marker.x - 17, 6), 360 - 40)} y="30" width="34" height="15" rx="7.5" fill="#0f766e" />
          <text
            x={Math.min(Math.max(marker.x - 17, 6), 360 - 40) + 17}
            y="40.5"
            fontSize="9"
            fontWeight="700"
            fill="#fff"
            textAnchor="middle"
          >
            {Math.round(markerHour)}시
          </text>
        </g>
      )}

      {/* 범례 */}
      {stage === "demand" ? (
        <g fontSize="8.5" fill="#334155">
          <line x1="22" y1="224" x2="40" y2="224" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" />
          <text x="44" y="227">전력수요 = 우리가 쓰는 전기</text>
          <text x="338" y="227" textAnchor="end" fill="#94a3b8">
            예시 그림
          </text>
        </g>
      ) : (
      <g fontSize="8.5" fill="#334155">
        <line x1="22" y1="224" x2="40" y2="224" stroke="#475569" strokeWidth="1.6" strokeDasharray="4 3" />
        <text x="44" y="227">전력수요</text>
        <rect x="100" y="219" width="14" height="10" rx="2" fill="url(#dc-solar)" />
        <text x="118" y="227">태양광</text>
        <line x1="158" y1="224" x2="176" y2="224" stroke="#9a3412" strokeWidth="3" strokeLinecap="round" />
        <text x="180" y="227">순부하 = 수요 − 태양광</text>
        <text x="338" y="227" textAnchor="end" fill="#94a3b8">
          예시 그림
        </text>
      </g>
      )}
    </svg>
  );
};
