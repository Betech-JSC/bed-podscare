import { NextRequest, NextResponse } from 'next/server';
import {
  PathTraversalError,
  linkMacHookClipPath,
  linkMacVideoPath,
  listWorkspaceProjects,
  sanitizeProjectId,
  saveScriptAndMeta,
  saveUploadedHookClip,
  saveUploadedVideo,
} from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/video-studio/upload
 * Accepts:
 * 1. multipart/form-data with `file` (or `video` / `hookClip` / `target='hook_clip'`) + optional `projectId`, `script`, `promptNotes`, `hookPrompt`
 *    -> saves to `tools/video-pipeline/workspace/<project_id>/source_video.mp4` or `custom_hook_clip.mp4`
 * 2. application/json with `macPath` / `videoPath` or `hookClipPath` (Zero-Copy local macOS file link fallback)
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Case 1: JSON body (Zero-Copy macOS path link fallback)
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      const rawProjectId =
        body?.projectId || body?.project_id || body?.id || 'demo_podscare_studio';
      const projectId = sanitizeProjectId(String(rawProjectId));
      const targetKind = String(body?.target || body?.uploadType || '').trim().toLowerCase();
      const hookClipPath = String(
        body?.hookClipPath || body?.customHookClipPath || body?.custom_hook_clip_path || ''
      ).trim();

      if (targetKind === 'hook_clip' || hookClipPath) {
        const resolvedHookPath =
          hookClipPath ||
          String(body?.macPath || body?.videoPath || body?.path || '').trim();
        if (!resolvedHookPath) {
          return NextResponse.json(
            {
              success: false,
              error: 'Vui lòng cung cấp đường dẫn file Clip Hook hợp lệ.',
              message: 'Vui lòng cung cấp đường dẫn file Clip Hook hợp lệ.',
            },
            { status: 400 }
          );
        }

        const linkedHook = await linkMacHookClipPath({
          projectId,
          hookClipPath: resolvedHookPath,
          hookPrompt: body?.hookPrompt ?? body?.hook_prompt,
        });

        return NextResponse.json({
          success: true,
          project_id: linkedHook.snapshot.project_id,
          projectId: linkedHook.snapshot.projectId,
          customHookClipPath: linkedHook.snapshot.custom_hook_clip_path,
          message: `Đã liên kết Clip Hook riêng vào dự án "${projectId}": ${linkedHook.snapshot.custom_hook_clip_path}`,
          data: linkedHook.snapshot,
          snapshot: linkedHook.snapshot,
          projects: listWorkspaceProjects(),
          logs: linkedHook.logs.join('\n\n'),
        });
      }

      const macVideoPath = String(
        body?.macPath ||
          body?.videoPath ||
          body?.path ||
          body?.sourceVideoPath ||
          body?.mac_video_path ||
          ''
      ).trim();

      if (!macVideoPath) {
        return NextResponse.json(
          {
            success: false,
            error: 'Vui lòng cung cấp file video hoặc đường dẫn macPath hợp lệ.',
            message: 'Vui lòng cung cấp file video hoặc đường dẫn macPath hợp lệ.',
          },
          { status: 400 }
        );
      }

      const linked = await linkMacVideoPath({
        projectId,
        videoPath: macVideoPath,
      });
      const { snapshot } = linked;

      return NextResponse.json({
        success: true,
        project_id: snapshot.project_id,
        projectId: snapshot.projectId,
        videoPath: snapshot.source_video,
        source_video_path: snapshot.source_video,
        durationSec: snapshot.video_metadata?.duration_sec ?? 24,
        fps: snapshot.fps,
        width: snapshot.video_metadata?.width ?? 1080,
        height: snapshot.video_metadata?.height ?? 1920,
        message: `Đã liên kết Zero-Copy file video trên máy Mac vào workspace "${projectId}".`,
        data: snapshot,
        snapshot,
        projects: listWorkspaceProjects(),
        logs: linked.logs.join('\n\n'),
      });
    }

    // Case 2: multipart/form-data file upload from browser
    const formData = await request.formData();
    const rawProjectId =
      formData.get('projectId') ||
      formData.get('project_id') ||
      formData.get('id') ||
      'demo_podscare_studio';
    const projectId = sanitizeProjectId(String(rawProjectId));
    const targetKind = String(formData.get('target') || formData.get('uploadType') || '')
      .trim()
      .toLowerCase();
    const hookClipEntry = formData.get('hookClip') || formData.get('custom_hook_clip');
    const isHookClipUpload = targetKind === 'hook_clip' || Boolean(hookClipEntry);

    const uploadedEntry =
      hookClipEntry ||
      formData.get('file') ||
      formData.get('video') ||
      formData.get('source_video') ||
      formData.get('videoFile');

    if (!uploadedEntry || typeof (uploadedEntry as Blob).arrayBuffer !== 'function') {
      return NextResponse.json(
        {
          success: false,
          error: 'Không tìm thấy file video trong FormData (trường "file", "video" hoặc "hookClip").',
          message: 'Không tìm thấy file video trong FormData.',
        },
        { status: 400 }
      );
    }

    const fileBlob = uploadedEntry as File;
    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    if (fileBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'File video tải lên bị rỗng (0 bytes).',
          message: 'File video tải lên bị rỗng (0 bytes).',
        },
        { status: 400 }
      );
    }

    const hookPromptField = formData.get('hookPrompt') ?? formData.get('hook_prompt');

    if (isHookClipUpload) {
      const uploadedHook = await saveUploadedHookClip({
        projectId,
        fileBuffer,
        originalName: fileBlob.name || 'custom_hook_clip.mp4',
        hookPrompt: typeof hookPromptField === 'string' ? hookPromptField : undefined,
      });
      const { snapshot } = uploadedHook;

      return NextResponse.json({
        success: true,
        project_id: snapshot.project_id,
        projectId: snapshot.projectId,
        customHookClipPath: snapshot.custom_hook_clip_path,
        fileName: fileBlob.name || 'custom_hook_clip.mp4',
        fileSizeBytes: fileBuffer.length,
        message: `Đã tải lên Clip Hook riêng "${fileBlob.name || 'custom_hook_clip.mp4'}" (${(
          fileBuffer.length /
          (1024 * 1024)
        ).toFixed(2)} MB) vào đầu video!`,
        data: snapshot,
        snapshot,
        projects: listWorkspaceProjects(),
        logs: uploadedHook.logs.join('\n\n'),
      });
    }

    const scriptField = formData.get('script') ?? formData.get('scriptContent');
    const promptNotesField = formData.get('promptNotes') ?? formData.get('prompt_notes');

    if (typeof promptNotesField === 'string' && promptNotesField.trim()) {
      await saveScriptAndMeta({
        projectId,
        scriptText: typeof scriptField === 'string' ? scriptField : '',
        cuttingPrompt: promptNotesField,
        hookPrompt: typeof hookPromptField === 'string' ? hookPromptField : undefined,
      });
    }

    const uploaded = await saveUploadedVideo({
      projectId,
      fileBuffer,
      originalName: fileBlob.name || 'source_video.mp4',
      scriptText: typeof scriptField === 'string' ? scriptField : undefined,
    });
    const { snapshot } = uploaded;

    return NextResponse.json({
      success: true,
      project_id: snapshot.project_id,
      projectId: snapshot.projectId,
      videoPath: snapshot.source_video,
      source_video_path: snapshot.source_video,
      fileName: fileBlob.name || 'source_video.mp4',
      fileSizeBytes: fileBuffer.length,
      durationSec: snapshot.video_metadata?.duration_sec ?? 24,
      fps: snapshot.fps,
      width: snapshot.video_metadata?.width ?? 1080,
      height: snapshot.video_metadata?.height ?? 1920,
      message: `Đã tải lên video "${fileBlob.name || 'source_video.mp4'}" (${(
        fileBuffer.length /
        (1024 * 1024)
      ).toFixed(2)} MB) vào workspace/${projectId}/source_video.mp4.`,
      data: snapshot,
      snapshot,
      projects: listWorkspaceProjects(),
      logs: uploaded.logs.join('\n\n'),
    });
  } catch (error: any) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Lỗi khi tải file video lên workspace.',
        message: error?.message || 'Lỗi khi tải file video lên workspace.',
      },
      { status: 500 }
    );
  }
}
