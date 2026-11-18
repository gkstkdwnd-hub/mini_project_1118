import React, { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { NewsBrief } from './NewsBrief';
import { NewsFeed, NewsTopic } from './NewsFeed';

const TOPICS: Array<{ key: NewsTopic; label: string; hint: string }> = [
  { key: 'all', label: '전체', hint: '수급·재생에너지·요금 기사를 최신순으로 모았어요' },
  { key: 'demand', label: '수급·수요', hint: '전력수요, 전력수급, 예비율, 전력거래소' },
  { key: 'renew', label: '재생에너지', hint: '태양광, 풍력, ESS 등 발전 소식' },
  { key: 'price', label: '요금·시장', hint: '전기요금, 한국전력, 전력시장, SMP' },
  { key: 'duck', label: '출력제어', hint: '출력제어, 경부하기 등 남는 전기 관련 소식 (최근 6개월)' },
];

export const PowerNewsView: React.FC = () => {
  const [topic, setTopic] = useState<NewsTopic>('all');
  const current = TOPICS.find((t) => t.key === topic) ?? TOPICS[0];

  return (
    <div className="space-y-4 py-2 max-w-3xl mx-auto">
      <NewsBrief
        onGoToNews={() => document.getElementById('news-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <section
        id="news-list"
        className="scroll-mt-24 flex flex-col w-full rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-sky-50 text-sky-700">
              <Newspaper className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 truncate">전력 뉴스</h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-500" />
              </span>
              LIVE
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div role="tablist" aria-label="뉴스 주제" className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={topic === t.key}
                onClick={() => setTopic(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  topic === t.key
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-teal-600 hover:text-teal-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-slate-500">{current.hint}</p>

          <NewsFeed key={topic} topic={topic} limit={20} emptyText="이 주제의 최근 기사를 찾지 못했어요." />
        </div>
      </section>
    </div>
  );
};
