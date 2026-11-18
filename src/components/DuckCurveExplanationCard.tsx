import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export const DuckCurveExplanationCard: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all duration-200 animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-50/70 via-white to-sky-50/50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="font-bold text-sm text-slate-900">덕 커브란?</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-white px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs cursor-pointer transition-colors"
        >
          <span>{isCollapsed ? '펼치기' : '접기'}</span>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-4 sm:p-5 flex flex-col md:flex-row gap-5 items-center">
          {/* Left SVG Illustration */}
          <div className="relative w-full md:w-56 h-36 bg-slate-50/80 rounded-xl border border-slate-200/80 p-2 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 200 120" className="w-full h-full" aria-label="덕 커브 예시 그림">
              {/* Corner label */}
              <text x="168" y="14" fontSize="8" fill="#94a3b8" fontWeight="500">
                예시 그림
              </text>

              {/* Duck Silhouette Outline (Light gray) */}
              <path
                d="M 40,75 C 35,60 45,45 60,40 C 70,35 85,38 92,48 C 105,42 120,40 135,45 C 150,55 160,75 155,95 C 150,105 130,110 90,110 C 50,110 42,90 40,75 Z"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              {/* Duck head & beak */}
              <path
                d="M 60,40 C 52,40 48,32 52,26 C 56,20 68,22 70,30 L 75,28"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />

              {/* Duck Curve Overlay (Orange) */}
              <path
                d="M 25,50 Q 50,45 75,70 Q 100,100 120,70 Q 140,30 175,45"
                fill="none"
                stroke="#ea580c"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Labels for Duck parts */}
              <text x="95" y="105" fontSize="9" fill="#c2410c" fontWeight="bold" textAnchor="middle">
                오리 배(낮)
              </text>
              <circle cx="100" cy="94" r="2.5" fill="#ea580c" />

              <text x="125" y="62" fontSize="9" fill="#c2410c" fontWeight="bold">
                오리 목(저녁)
              </text>
              <circle cx="120" cy="70" r="2.5" fill="#ea580c" />

              <text x="145" y="28" fontSize="9" fill="#c2410c" fontWeight="bold">
                오리 머리(밤)
              </text>
              <circle cx="170" cy="43" r="2.5" fill="#ea580c" />
            </svg>
          </div>

          {/* Right Exact Explanations */}
          <div className="flex flex-col space-y-2.5 text-xs text-slate-700 leading-relaxed font-sans">
            <p className="font-semibold text-slate-900">
              덕 커브(Duck Curve)는 하루 동안의 &apos;순부하&apos; 그래프가 오리 옆모습을 닮아서 붙은 이름입니다.
            </p>
            <p>
              낮에는 태양광 발전이 많아 다른 발전기가 채워야 할 몫이 푹 줄어들고(오리 배), 해가 지면 짧은 시간에 다시 크게 늘어납니다(오리 목).
            </p>
            <p className="text-teal-800 font-medium">
              이 앱은 2025년 공개 데이터로 이 모양이 실제로 나타나는지, 봄과 가을 중 언제 더 심한지 확인합니다.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
