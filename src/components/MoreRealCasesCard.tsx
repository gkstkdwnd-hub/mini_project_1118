import React from 'react';
import { ExternalLink, Globe2, Newspaper } from 'lucide-react';
import { AnalysisResult } from '../utils/kpxParser';

interface RealCase {
  id: string;
  region: string;
  title: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
  takeaway: string;
  source: { name: string; date: string; url: string };
  kind: 'news' | 'report';
}

// 원문을 직접 열어 확인한 수치만 적는다. 새 사례를 넣을 때도 출처 링크와 날짜를 함께 적을 것.
const CASES: RealCase[] = [
  {
    id: 'kr-curtailment-2025',
    region: '대한민국',
    title: '2025년 태양광·원전 출력제어 급증',
    summary:
      '봄·가을 경부하기에 태양광 발전이 몰리고 송전망이 이를 다 받아내지 못해, 발전기 출력을 일부러 줄이는 일이 크게 늘었습니다.',
    stats: [
      { label: '태양광 출력제어', value: '88회 (전년 31회)' },
      { label: '태양광 제어량(추정)', value: '약 7.8 → 65 GWh' },
      { label: '원전 출력제어', value: '37회 (전년 3회)' },
      { label: '호남권 태양광', value: '47회 · 40GWh 이상' },
    ],
    takeaway:
      '낮에 남는 전기가 늘어난다는 덕 커브의 ‘배’ 부분이 실제 계통 운영에서 출력제어 횟수로 나타난 사례입니다.',
    source: {
      name: '헤럴드경제 미주판 · 김소희 의원 분석(기후에너지환경부 제출자료)',
      date: '2026.4.22',
      url: 'https://www.heraldk.com/article/2026042200000352717',
    },
    kind: 'news',
  },
  {
    id: 'us-caiso-2025',
    region: '미국 캘리포니아',
    title: '덕 커브의 원조 CAISO, 순부하가 마이너스로',
    summary:
      '덕 커브라는 이름이 처음 붙은 캘리포니아에서는 2025년 4월 평균 순부하가 낮 시간대에 마이너스가 될 정도로 깊어졌습니다. 이제는 오리보다 ‘협곡’에 가깝다는 평가입니다.',
    stats: [
      { label: '4월 태양광 최대', value: '21 GW (발전량의 32%)' },
      { label: '평균 순부하 < 0', value: '10시 ~ 15시' },
      { label: '하루 순부하 변동', value: '8시간에 24GW 이상' },
      { label: '배터리 역할', value: '낮에 충전 → 저녁 방전' },
    ],
    takeaway:
      '태양광이 더 늘면 덕 커브의 배가 계속 깊어집니다. 저녁 급상승(목)을 받쳐 줄 배터리·유연 전원이 핵심이라는 점이 이 앱의 ‘저녁 상승폭’ 지표와 같은 문제의식입니다.',
    source: {
      name: 'GridStatus 블로그 (Tim Ennis, Connor Waldoch)',
      date: '2025.6.4',
      url: 'https://blog.gridstatus.io/caiso-solar-storage-spring-2025/',
    },
    kind: 'report',
  },
];

interface MoreRealCasesCardProps {
  analysis: AnalysisResult | null;
}

export const MoreRealCasesCard: React.FC<MoreRealCasesCardProps> = ({ analysis }) => {
  const minNet = analysis?.minNetLoad ?? null;

  return (
    <section className="flex flex-col w-full rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-sky-50 text-sky-700">
            <Globe2 className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 truncate">다른 실제 사례</h3>
        </div>
        <span className="text-[11px] text-slate-500">{CASES.length}건</span>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {CASES.map((c) => (
          <article
            key={c.id}
            className="flex flex-col p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                {c.region}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Newspaper className="w-3 h-3" />
                {c.kind === 'news' ? '언론 보도' : '분석 글'}
              </span>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900 leading-snug">{c.title}</h4>
              <p className="text-xs text-slate-700 leading-relaxed">{c.summary}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {c.stats.map((s) => (
                <div key={s.label} className="p-2 rounded-lg bg-white border border-slate-200">
                  <dt className="text-[11px] text-slate-500">{s.label}</dt>
                  <dd className="text-xs font-bold text-slate-900 font-mono-num mt-0.5">{s.value}</dd>
                </div>
              ))}
            </dl>

            <p className="text-xs text-teal-900 leading-relaxed p-2.5 rounded-lg bg-teal-50/70 border border-teal-100">
              {c.takeaway}
            </p>

            <a
              href={c.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-start gap-1 text-[11px] text-slate-500 hover:text-teal-700 leading-snug"
            >
              <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                출처: {c.source.name} ({c.source.date})
              </span>
            </a>
          </article>
        ))}
      </div>

      {minNet && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="text-xs text-slate-800 font-medium leading-relaxed font-mono-num">
            이 앱의 결과: 최저 순부하 {Math.round(minNet.netLoad).toLocaleString('ko-KR')} MWh ({minNet.date}{' '}
            {minNet.hour}시)
            {minNet.netLoad < 0
              ? ' — 마이너스까지 내려갔습니다.'
              : ' — 거래 기준으로는 아직 마이너스는 아닙니다.'}
          </p>
        </div>
      )}

      <p className="px-4 pb-4 text-[11px] text-slate-400 leading-snug">
        언론 보도와 분석 글은 1차 통계가 아니라 이를 인용한 2차 자료입니다. 정확한 값이 필요하면 각 글이 인용한
        원자료(전력거래소·정부 제출자료, CAISO)를 확인하세요. 한국의 순부하는 전력시장 거래분 기준이라 태양광 전체(자가용 등)는
        반영되지 않습니다.
      </p>
    </section>
  );
};
