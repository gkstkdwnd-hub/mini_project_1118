import React, { useState } from 'react';
import { Calculator, Newspaper, Sun } from 'lucide-react';
import { BoardView } from './components/BoardView';
import { CalcPage } from './components/CalcPage';
import { PowerNewsView } from './components/PowerNewsView';

type TabKey = 'story' | 'calc' | 'news';

const TABS: Array<{ key: TabKey; label: string; subtitle: string; Icon: typeof Sun }> = [
  { key: 'story', label: '오늘의 전기', subtitle: '우리나라 전기는 오늘 어떤 하루를 보낼까?', Icon: Sun },
  { key: 'calc', label: '요금 계산기', subtitle: '누진제까지 반영한 우리 집 전기요금', Icon: Calculator },
  { key: 'news', label: '전력 뉴스', subtitle: '오늘 나온 전기·에너지 소식', Icon: Newspaper },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('story');
  const index = Math.max(0, TABS.findIndex((t) => t.key === activeTab));
  const current = TABS[index];

  // 탭을 옮기면 새 페이지의 맨 위부터 보이게 한다.
  const go = (tab: TabKey) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="fixed top-0 inset-x-0 z-40 pt-safe bg-gradient-to-r from-white via-teal-50/60 to-sky-50/80 backdrop-blur-md border-b border-teal-100/80 shadow-xs">
        <div className="w-full h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white border border-teal-200/80 shadow-2xs flex items-center justify-center shrink-0">
            <Sun className="w-5 h-5 text-amber-500 fill-amber-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-base text-slate-900 truncate tracking-tight">오늘의 전기</span>
            <span className="text-xs text-slate-600 truncate">{current.subtitle}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full pt-20 pb-24 px-4 sm:px-6 lg:px-8">
        {activeTab === 'story' && <BoardView />}
        {activeTab === 'calc' && <CalcPage />}
        {activeTab === 'news' && <PowerNewsView />}

      </main>

      <nav
        aria-label="주요 메뉴"
        className="fixed bottom-0 inset-x-0 z-40 pb-safe bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className="w-full max-w-md mx-auto flex justify-around items-center gap-1 h-16 px-2 sm:px-4">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => go(key)}
              aria-current={activeTab === key ? 'page' : undefined}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 min-h-[44px] px-1 py-1.5 transition-all cursor-pointer ${
                activeTab === key
                  ? 'bg-teal-700 text-white font-bold rounded-2xl shadow-sm scale-105'
                  : 'text-slate-400 hover:text-slate-700 font-medium rounded-2xl'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] sm:text-[11px] mt-0.5 leading-tight text-center break-keep">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
