import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_PROJECT_ID,
  getJobStepsSnapshot,
} from '../../../../../../lib/video-studio/server-bridge';
import { VideoStudioStepEvent } from '../../../../../../lib/video-studio/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/jobs/[id]/events
 * Streams Server-Sent Events (`text/event-stream`) for the 5 fixed Vietnamese steps:
 * 1: "Đọc video"
 * 2: "Nhận diện giọng nói"
 * 3: "Chọn đoạn tốt nhất"
 * 4: "Dựng & xuất"
 * 5: "Kiểm tra"
 *
 * Each SSE `data:` frame conforms to Section 5.1:
 * {
 *   "step": 1,
 *   "label": "Đọc video",
 *   "status": "waiting | running | done | error",
 *   "percent": 20,
 *   "detail": "Đã nhận diện 412 từ",
 *   "error": {
 *     "message": "Không kết nối được dịch vụ AI.",
 *     "fix": "Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.",
 *     "retry_from": 3
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const resolvedParams = await Promise.resolve(context.params);
  const jobIdOrProjectId = resolvedParams?.id || DEFAULT_PROJECT_ID;

  const simErrRaw = request.nextUrl.searchParams.get('simulate_error_step');
  const simulateErrorStep = simErrRaw ? Number(simErrRaw) : null;

  // Support optional ?format=json for quick diagnostic checks while defaulting to text/event-stream
  if (request.nextUrl.searchParams.get('format') === 'json') {
    const snap = await getJobStepsSnapshot(jobIdOrProjectId, { simulateErrorStep });
    return NextResponse.json({
      ok: true,
      job_id: snap.jobId,
      project_id: snap.projectId,
      status: snap.status,
      steps: snap.steps,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sentSignatures = new Map<number, string>();
      const startTime = Date.now();
      const maxWaitMs = 55000;

      const emitSteps = (steps: any[]) => {
        for (const stepEvt of steps) {
          const sig = JSON.stringify(stepEvt);
          if (sentSignatures.get(stepEvt.step) !== sig) {
            sentSignatures.set(stepEvt.step, sig);
            controller.enqueue(encoder.encode(`data: ${sig}\n\n`));
          }
        }
      };

      try {
        while (Date.now() - startTime < maxWaitMs) {
          const snap = await getJobStepsSnapshot(jobIdOrProjectId, {
            simulateErrorStep,
          });
          emitSteps(snap.steps);

          const isTerminal =
            snap.status === 'done' ||
            snap.status === 'error' ||
            snap.steps.every((s: VideoStudioStepEvent) => s.status === 'done') ||
            snap.steps.some((s: VideoStudioStepEvent) => s.status === 'error');

          if (isTerminal) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (err: any) {
        const fallbackErr = {
          step: 3,
          label: 'Chọn đoạn tốt nhất',
          status: 'error',
          percent: 50,
          detail: err?.message || 'Không kết nối được dịch vụ AI.',
          error: {
            message: 'Không kết nối được dịch vụ AI.',
            fix: 'Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.',
            retry_from: 3,
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(fallbackErr)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
