import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveData {
  currentDemand: number | null;
  supplyCapacity: number | null;
  forecastPeak: number | null;
  supplyReserve: number | null;
  supplyReserveRate: number | null;
  baseDatetime: string | null;
  fetchedAt?: string;
  cached?: boolean;
  stale?: boolean;
  limited?: boolean;
  retryAfterSec?: number;
}

export interface LiveNotice {
  tone: 'ok' | 'info' | 'warn';
  text: string;
}

/**
 * 한국전력거래소 실시간 수급을 불러온다.
 * - 화면이 보이는 동안 pollMs마다 서버에 물어본다 (서버가 값을 저장해 두므로 호출 한도에는 영향이 적다).
 * - 탭으로 돌아오면 바로 한 번 더 확인한다.
 * - refresh()는 사용자가 누른 새로고침으로, 서버 저장값을 건너뛰고 결과를 안내 문구로 돌려준다.
 */
export function useLiveDemand(pollMs = 60 * 1000) {
  const [live, setLive] = useState<LiveData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<LiveNotice | null>(null);
  const liveRef = useRef<LiveData | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);

  const showNotice = useCallback((next: LiveNotice | null) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(next);
    if (next) noticeTimer.current = window.setTimeout(() => setNotice(null), 8000);
  }, []);

  const load = useCallback(
    async (manual = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (manual) setLoading(true);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(manual ? '/api/live-demand?force=1' : '/api/live-demand', {
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as (LiveData & { error?: string }) | null;
        if (!res.ok || !body || body.error || body.currentDemand === null) {
          throw new Error(body?.error || `실시간 정보를 가져오지 못했어요 (${res.status}).`);
        }

        const prev = liveRef.current;
        liveRef.current = body;
        setLive(body);
        setFailed(false);

        if (body.stale) {
          showNotice({ tone: 'warn', text: '전력거래소에 연결하지 못해 이전 값을 보여 주고 있어요.' });
        } else if (body.limited) {
          showNotice({ tone: 'warn', text: '오늘 조회 한도에 도달해 마지막 값을 보여 줘요. 내일 다시 갱신돼요.' });
        } else if (manual && body.retryAfterSec) {
          showNotice({ tone: 'info', text: `방금 확인한 값이에요. ${body.retryAfterSec}초 뒤에 다시 눌러 주세요.` });
        } else if (manual && prev && prev.baseDatetime === body.baseDatetime) {
          showNotice({ tone: 'info', text: '이미 가장 최신 값이에요. 전력거래소가 5분마다 새 값을 내놓아요.' });
        } else if (manual) {
          showNotice({ tone: 'ok', text: '최신 값으로 갱신했어요.' });
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        const message = aborted
          ? '응답이 늦어져서 중단했어요.'
          : err instanceof Error
          ? err.message
          : '실시간 정보를 가져오지 못했어요.';
        // 이미 보여 주던 값은 그대로 두고, 값이 하나도 없을 때만 실패 상태로 둔다.
        if (!liveRef.current) setFailed(true);
        if (manual || liveRef.current) showNotice({ tone: 'warn', text: `갱신 실패: ${message}` });
      } finally {
        window.clearTimeout(timeoutId);
        inFlight.current = false;
        setLoading(false);
      }
    },
    [showNotice]
  );

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(noticeTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, pollMs]);

  const refresh = useCallback(() => load(true), [load]);

  return { live, failed, loading, notice, refresh };
}
