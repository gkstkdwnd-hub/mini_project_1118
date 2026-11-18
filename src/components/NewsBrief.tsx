import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';

interface BriefData {
  bullets: string[];
  basedOn: number;
  fetchedAt: string;
  stale?: boolean;
}

interface NewsBriefProps {
  /** 주면 ‘기사 원문 보기’ 버튼이 나온다. */
  onGoToNews?: () => void;
}

export const NewsBrief: React.FC<NewsBriefProps> = ({ onGoToNews }) => {
  const [data, setData] = useState<BriefData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 40000);
    try {
      const res = await fetch('/api/news-brief', { signal: controller.signal });
      const body = (await res.json().catch(() => null)) as (BriefData & { error?: string }) | null;
      if (!res.ok || !body || body.error || !Array.isArray(body.bullets)) {
        throw new Error(body?.error || `소식을 정리하지 못했어요 (${res.status}).`);
      }
      setData(body);
      setError(null);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted ? '정리가 늦어지고 있어요. 잠시 후 다시 시도해 주세요.' : err instanceof Error ? err.message : '소식을 정리하지 못했어요.');
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-700" />
          <h3 className="font-bold text-sm text-slate-900">오늘의 전기 소식 3줄</h3>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          다시 보기
        </button>
      </div>

      <div className="p-4 space-y-3">
        {!data && !error && (
          <ul className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </ul>
        )}

        {error && !data && (
          <p role="status" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {data && (
          <ol className="space-y-2">
            {data.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-50/60 border border-teal-100">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-700 text-white text-[11px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-800 leading-relaxed break-keep">{b}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 leading-snug">
            AI가 오늘 전력 뉴스 제목 {data ? `${data.basedOn}개` : ''}를 보고 정리했어요. 기사 본문은 읽지 않아서 틀릴 수 있어요.
            {data?.stale ? ' (연결이 불안정해 이전 정리를 보여 줘요)' : ''}
          </p>
          {onGoToNews && (
            <button
              type="button"
              onClick={onGoToNews}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
            >
              기사 원문 보기 <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
