import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export type NewsTopic = 'duck' | 'demand' | 'renew' | 'price' | 'all';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

interface NewsResponse {
  items: NewsItem[];
  fetchedAt: string;
  cached?: boolean;
  stale?: boolean;
  error?: string;
}

interface NewsFeedProps {
  topic: NewsTopic;
  /** 보여 줄 기사 수 (기본 8) */
  limit?: number;
  /** 자동 갱신 주기(분, 기본 10) */
  refreshMinutes?: number;
  /** 새 기사가 없을 때 안내 문구 */
  emptyText?: string;
}

function timeAgo(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function isFresh(iso: string, now: number): boolean {
  return now - new Date(iso).getTime() < 3 * 3600 * 1000;
}

export const NewsFeed: React.FC<NewsFeedProps> = ({
  topic,
  limit = 8,
  refreshMinutes = 10,
  emptyText = '지금 보여 줄 기사가 없어요.',
}) => {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  const load = useCallback(
    async (manual = false) => {
      const myId = ++requestId.current;
      setLoading(true);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(`/api/news?topic=${topic}${manual ? '&force=1' : ''}`, {
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as NewsResponse | null;
        // 주제를 바꾸는 사이에 늦게 도착한 이전 응답은 버린다.
        if (myId !== requestId.current) return;
        if (!res.ok || !body || body.error || !Array.isArray(body.items)) {
          throw new Error(body?.error || `기사를 가져오지 못했어요 (${res.status}).`);
        }
        setItems(body.items);
        setFetchedAt(body.fetchedAt);
        setStale(Boolean(body.stale));
        setError(null);
      } catch (err) {
        if (myId !== requestId.current) return;
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        setError(
          aborted
            ? '응답이 늦어져서 중단했어요. 잠시 후 다시 시도해 주세요.'
            : err instanceof Error
            ? err.message
            : '기사를 가져오지 못했어요.'
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (myId === requestId.current) {
          setLoading(false);
          setNow(Date.now());
        }
      }
    },
    [topic]
  );

  // 주제가 바뀌면 즉시 다시 불러오고, 이후에는 주기적으로 자동 갱신한다.
  useEffect(() => {
    setItems(null);
    setError(null);
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, refreshMinutes * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshMinutes]);

  // "N분 전" 표시를 1분마다 새로 계산한다.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const shown = items?.slice(0, limit) ?? null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-[11px] text-slate-500">
          {fetchedAt
            ? `${new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 확인 · ${refreshMinutes}분마다 자동 갱신`
            : '불러오는 중…'}
        </span>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {(error || stale) && (
        <div role="status" className="mb-2 px-3 py-2 rounded-xl border text-xs font-medium bg-amber-50 border-amber-200 text-amber-900">
          {error ?? '뉴스 서버에 연결하지 못해 이전에 받은 기사를 보여 주고 있어요.'}
        </div>
      )}

      {!shown && !error && (
        <ul className="space-y-2" aria-hidden="true">
          {Array.from({ length: Math.min(limit, 4) }, (_, i) => (
            <li key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </ul>
      )}

      {shown && shown.length === 0 && <p className="text-xs text-slate-500 py-4">{emptyText}</p>}

      {shown && shown.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {shown.map((item) => (
            <li key={item.link}>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900 leading-snug group-hover:text-teal-800 break-keep">
                    {item.title}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{item.source}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={item.publishedAt}>{timeAgo(item.publishedAt, now)}</time>
                    {isFresh(item.publishedAt, now) && (
                      <span className="px-1.5 py-px rounded-sm bg-rose-50 text-rose-600 font-bold text-[10px]">NEW</span>
                    )}
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-300 group-hover:text-teal-700" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="pt-2 text-[11px] text-slate-400 leading-snug">
        기사 제목과 링크는 구글 뉴스 검색 결과이며, 누르면 각 언론사 기사로 이동합니다. 내용은 이 앱이 검증하지 않은
        보도입니다.
      </p>
    </div>
  );
};
