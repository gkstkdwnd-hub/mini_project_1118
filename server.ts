import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface FuelNumbersPayload {
  원자력: number | null;
  유연탄: number | null;
  LNG: number | null;
  양수: number | null;
  태양광?: number | null;
  풍력?: number | null;
}

interface AiInsightsPayload {
  dayRange: [number, number];
  eveningRange: [number, number];
  springDayMin: { value: number; hour: number } | null;
  autumnDayMin: { value: number; hour: number } | null;
  springEveningRamp: number | null;
  autumnEveningRamp: number | null;
  minDemand: {
    value: number;
    date: string;
    dayOfWeek: string;
    hour: number;
  };
  minNetLoad: {
    value: number;
    date: string;
    hour: number;
  };
  minDemandFuels: FuelNumbersPayload | null;
  minDemandDay04Fuels: FuelNumbersPayload | null;
  minDemandDay19Fuels: FuelNumbersPayload | null;
}

const SYSTEM_INSTRUCTION =
  "너는 전력 데이터를 쉽게 설명하는 해설자야. 아래 숫자만 사용해서 봄과 가을의 덕 커브 차이와 연중 최저 수요일에 발전원별 출력이 어떻게 달라졌는지 일반인이 이해하기 쉽게 5문장에서 7문장으로 설명해. 주어진 숫자 외에 새로운 숫자를 만들지 마. 출력 변화의 원인은 단정하지 말고 '~로 보입니다'처럼 표현해. 마지막 문장에는 이 데이터가 전력시장 거래분 기준이고 수요는 잠정자료라는 한계를 언급해.";

function fmtMwh(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '데이터 없음';
  }
  return `${Math.round(val).toLocaleString('ko-KR')} MWh`;
}

function formatCalculatedSummaryPrompt(p: AiInsightsPayload): string {
  const lines: string[] = [
    '[계산된 숫자 요약]',
    `낮 구간: ${p.dayRange[0]}시~${p.dayRange[1]}시`,
    `저녁 구간: ${p.eveningRange[0]}시~${p.eveningRange[1]}시`,
    `봄 낮 최저 순부하: ${p.springDayMin ? `${fmtMwh(p.springDayMin.value)} (${p.springDayMin.hour}시)` : '데이터 없음'}`,
    `가을 낮 최저 순부하: ${p.autumnDayMin ? `${fmtMwh(p.autumnDayMin.value)} (${p.autumnDayMin.hour}시)` : '데이터 없음'}`,
    `봄 저녁 상승폭: ${fmtMwh(p.springEveningRamp)}`,
    `가을 저녁 상승폭: ${fmtMwh(p.autumnEveningRamp)}`,
    `연중 최저 수요: ${fmtMwh(p.minDemand.value)} (${p.minDemand.date} ${p.minDemand.dayOfWeek}요일 ${p.minDemand.hour}시)`,
    `최저 순부하: ${fmtMwh(p.minNetLoad.value)} (${p.minNetLoad.date} ${p.minNetLoad.hour}시)`,
  ];

  if (p.minDemandFuels) {
    lines.push(
      `연중 최저 수요 시각 발전량: 원자력 ${fmtMwh(p.minDemandFuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandFuels.유연탄)}, LNG ${fmtMwh(p.minDemandFuels.LNG)}, 양수 ${fmtMwh(p.minDemandFuels.양수)}, 태양광 ${fmtMwh(p.minDemandFuels.태양광)}, 풍력 ${fmtMwh(p.minDemandFuels.풍력)}`
    );
  } else {
    lines.push('연중 최저 수요 시각 발전량: 연료원별 파일 미업로드');
  }

  if (p.minDemandDay04Fuels) {
    lines.push(
      `같은 날 4시 발전량: 원자력 ${fmtMwh(p.minDemandDay04Fuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandDay04Fuels.유연탄)}, LNG ${fmtMwh(p.minDemandDay04Fuels.LNG)}, 양수 ${fmtMwh(p.minDemandDay04Fuels.양수)}`
    );
  } else {
    lines.push('같은 날 4시 발전량: 데이터 없음');
  }

  if (p.minDemandDay19Fuels) {
    lines.push(
      `같은 날 19시 발전량: 원자력 ${fmtMwh(p.minDemandDay19Fuels.원자력)}, 유연탄 ${fmtMwh(p.minDemandDay19Fuels.유연탄)}, LNG ${fmtMwh(p.minDemandDay19Fuels.LNG)}, 양수 ${fmtMwh(p.minDemandDay19Fuels.양수)}`
    );
  } else {
    lines.push('같은 날 19시 발전량: 데이터 없음');
  }

  return lines.join('\n');
}

function extractShortError(err: unknown): { status: number; message: string } {
  const errObj = err as { status?: number; message?: string; name?: string } | null;
  if (errObj?.name === 'AbortError' || errObj?.name === 'TimeoutError') {
    return { status: 504, message: '응답 시간이 초과됐어요. 다시 시도해 주세요' };
  }

  const rawMsg = errObj?.message ?? String(err ?? 'Unknown error');
  const status = typeof errObj?.status === 'number' ? errObj.status : 500;

  if (status === 401 || status === 403 || rawMsg.includes('API_KEY') || rawMsg.includes('PERMISSION_DENIED')) {
    return { status: 403, message: 'API 키 또는 권한 오류가 발생했습니다 (403).' };
  }
  if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return { status: 429, message: '요청 한도를 초과했습니다 (429). 잠시 후 다시 시도해 주세요.' };
  }
  if (status === 404 || rawMsg.includes('NOT_FOUND')) {
    return { status: 404, message: 'AI 모델을 찾을 수 없습니다 (404).' };
  }
  if (status === 503 || rawMsg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'AI 서버 요청이 많아 일시적으로 응답이 어렵습니다 (503). 잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: `AI 해설 생성 중 오류가 발생했습니다 (${status}).`,
  };
}

function isRetryableGeminiError(err: unknown): boolean {
  const errObj = err as { status?: number; message?: string; name?: string } | null;
  if (!errObj) return false;
  if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') return false;
  const status = errObj.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = errObj.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '64kb' }));

  app.post('/api/ai-insights', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.error('[ai-insights] GEMINI_API_KEY is missing or unset');
      res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
      return;
    }

    const payload = req.body as AiInsightsPayload | undefined;
    if (
      !payload ||
      !payload.minDemand ||
      !payload.minNetLoad ||
      !Array.isArray(payload.dayRange) ||
      !Array.isArray(payload.eveningRange)
    ) {
      res.status(400).json({ error: '계산된 요약 데이터가 올바르지 않습니다.' });
      return;
    }

    const overallController = new AbortController();
    const overallTimeoutId = setTimeout(() => overallController.abort(), 28000);

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          timeout: 14000,
        },
      });

      const prompt = formatCalculatedSummaryPrompt(payload);
      const candidates: Array<{
        model: string;
        thinkingLevel: ThinkingLevel;
        attemptTimeoutMs: number;
      }> = [
        {
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
          attemptTimeoutMs: 12000,
        },
        {
          model: 'gemini-3.1-flash-lite',
          thinkingLevel: ThinkingLevel.MINIMAL,
          attemptTimeoutMs: 14000,
        },
      ];

      let lastError: unknown = null;
      let responseText: string | undefined;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (overallController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const attemptController = new AbortController();
        const attemptTimer = setTimeout(
          () => attemptController.abort(),
          candidate.attemptTimeoutMs
        );
        const onOverallAbort = () => attemptController.abort();
        overallController.signal.addEventListener('abort', onOverallAbort, {
          once: true,
        });

        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: {
                thinkingLevel: candidate.thinkingLevel,
              },
              abortSignal: attemptController.signal,
            },
          });
          responseText = response.text?.trim();
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const isAttemptTimeout =
            !overallController.signal.aborted &&
            attemptController.signal.aborted;
          const shouldFallback =
            i < candidates.length - 1 &&
            !overallController.signal.aborted &&
            (isAttemptTimeout || isRetryableGeminiError(err));

          if (shouldFallback) {
            console.warn(
              `[ai-insights] ${candidate.model} failed (${isAttemptTimeout ? 'timeout' : 'retryable error'}), trying fallback model...`
            );
            continue;
          }
          throw err;
        } finally {
          clearTimeout(attemptTimer);
          overallController.signal.removeEventListener('abort', onOverallAbort);
        }
      }

      if (lastError) {
        throw lastError;
      }

      if (!responseText) {
        console.error('[ai-insights] Empty response from Gemini');
        res.status(502).json({ error: 'AI 응답이 비어 있습니다. 다시 시도해 주세요.' });
        return;
      }

      res.json({ text: responseText });
    } catch (err) {
      console.error('[ai-insights] Gemini API call failed:', err);
      const info = extractShortError(err);
      res.status(info.status).json({ error: info.message });
    } finally {
      clearTimeout(overallTimeoutId);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
