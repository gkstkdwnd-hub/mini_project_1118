import React from 'react';
import { Calculator, FileText, Layers, ShieldCheck } from 'lucide-react';
import { ApplianceCalculator } from './ApplianceCalculator';
import { TARIFF_AS_OF } from '../utils/kepcoBill';

export const CalcPage: React.FC = () => {
  return (
    <div className="space-y-6 py-2 max-w-3xl mx-auto">
      <section className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 text-white p-5 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-amber-300/20 blur-2xl" aria-hidden="true" />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-100">
            <Calculator className="w-4 h-4" />
            전기요금 계산기
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight break-keep">우리 집 가전, 누진제까지 정확하게</h1>
          <p className="mt-2 text-sm text-teal-50/90 leading-relaxed">
            우리 집 한 달 전기 사용량과 쓰는 가전을 넣으면, 각 가전이 요금에 얼마를 더하는지 한국전력 요금표 기준으로 계산해 드려요.
          </p>

          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/10 border border-white/15">
              <Layers className="w-4 h-4 shrink-0 mt-0.5 text-amber-200" />
              <span className="leading-snug">구간별 누진 단가와 기본요금까지 반영</span>
            </li>
            <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/10 border border-white/15">
              <FileText className="w-4 h-4 shrink-0 mt-0.5 text-amber-200" />
              <span className="leading-snug">부가세·전력기금 포함 예상 청구서</span>
            </li>
            <li className="flex items-start gap-2 p-2.5 rounded-xl bg-white/10 border border-white/15">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-200" />
              <span className="leading-snug">입력한 내용은 이 기기에만 저장</span>
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-teal-100/80">요금표 기준: {TARIFF_AS_OF}</p>
        </div>
      </section>

      <ApplianceCalculator />

    </div>
  );
};
