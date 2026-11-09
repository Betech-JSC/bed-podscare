<?php

namespace App\Http\Controllers\Api\V1\Threads;

use App\Http\Controllers\Controller;
use App\Services\Threads\ThreadsCsvImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ThreadsImportController extends Controller
{
    /**
     * Nhập hàng loạt bài đăng Threads từ file CSV, chuỗi CSV hoặc mảng dữ liệu (100+ bài)
     * kèm thuật toán Random Jitter Scheduler và kiểm định ThreadsPostValidator.
     */
    public function importCsv(Request $request, ThreadsCsvImportService $importService): JsonResponse
    {
        $source = null;

        if ($request->hasFile('file')) {
            $source = $request->file('file');
        } elseif ($request->hasFile('csv_file')) {
            $source = $request->file('csv_file');
        } elseif ($request->filled('csv_text')) {
            $source = (string) $request->input('csv_text');
        } elseif ($request->filled('csv_content')) {
            $source = (string) $request->input('csv_content');
        } elseif ($request->filled('csv')) {
            $source = (string) $request->input('csv');
        } elseif (is_array($request->input('rows'))) {
            $source = $request->input('rows');
        } elseif (is_array($request->input('posts'))) {
            $source = $request->input('posts');
        } elseif (is_array($request->input('items'))) {
            $source = $request->input('items');
        }

        if ($source === null || ($source === '' || (is_array($source) && empty($source)))) {
            return $this->failure(
                'Vui lòng tải lên file CSV (file) hoặc cung cấp dữ liệu đầu vào (csv_text / rows).',
                422,
                ['file' => ['Dữ liệu CSV đầu vào không được để trống.']],
                'THREADS_IMPORT__EMPTY_INPUT'
            );
        }

        $options = [
            'import_batch_id'          => $request->input('import_batch_id'),
            'default_account_id'       => $request->input('default_account_id', $request->input('account_id')),
            'active_hours_start'       => $request->input('active_hours_start'),
            'active_hours_end'         => $request->input('active_hours_end'),
            'daily_post_cap'           => $request->input('daily_post_cap'),
            'jitter_minutes'           => $request->input('jitter_minutes'),
            'jitter_min_minutes'       => $request->input('jitter_min_minutes'),
            'jitter_max_minutes'       => $request->input('jitter_max_minutes'),
            'default_is_sponsored'     => $request->input('default_is_sponsored'),
            'default_sponsored_suffix' => $request->input('default_sponsored_suffix'),
            'default_client_ref'       => $request->input('default_client_ref'),
            'dry_run'                  => $request->boolean('dry_run', $request->boolean('preview_only', false)),
            'allow_duplicate'          => $request->boolean('allow_duplicate', false),
            'base_date'                => $request->input('base_date', $request->input('start_date')),
            'status'                   => $request->input('status', 'scheduled'),
        ];

        $result = $importService->import($source, $options);

        if ($result['total_rows'] === 0) {
            return response()->json([
                'success'    => false,
                'message'    => 'File CSV trống hoặc không có dòng dữ liệu hợp lệ.',
                'error_code' => 'THREADS_IMPORT__NO_ROWS',
                'errors'     => $result['errors'],
                'data'       => $result,
            ], 422);
        }

        // Nếu toàn bộ các dòng đều bị lỗi kiểm định (imported_count == 0 && failed_count > 0), trả về 422 kèm chi tiết
        if ($result['imported_count'] === 0 && $result['failed_count'] > 0) {
            $firstError = $result['errors'][0] ?? [];
            $errorCode = $firstError['error_code'] ?? 'THREADS_IMPORT__VALIDATION_FAILED';
            $message = $firstError['message'] ?? 'Dữ liệu CSV không vượt qua kiểm định.';

            return response()->json([
                'success'    => false,
                'message'    => $message,
                'error_code' => $errorCode,
                'errors'     => $result['errors'],
                'data'       => $result,
            ], 422);
        }

        $message = sprintf(
            'Đã nhập thành công %d/%d bài đăng Threads (Batch: %s).',
            $result['imported_count'],
            $result['total_rows'],
            $result['import_batch_id']
        );

        return $this->success($result, $message);
    }

    /**
     * Alias cho importCsv().
     */
    public function import(Request $request, ThreadsCsvImportService $importService): JsonResponse
    {
        return $this->importCsv($request, $importService);
    }

    /**
     * Tải file hoặc nội dung CSV mẫu chuẩn UTF-8 (sampleCsv).
     */
    public function sampleCsv(Request $request, ThreadsCsvImportService $importService): Response|JsonResponse
    {
        $rowsCount = $request->filled('rows')
            ? max(4, min(200, (int) $request->input('rows')))
            : 12;

        $csvContent = $importService->getSampleCsvContent($rowsCount);
        $filename = 'threads_bulk_import_sample.csv';

        if (
            ! $request->boolean('download', false)
            && ($request->wantsJson() || strtolower((string) $request->query('format')) === 'json')
        ) {
            return $this->success([
                'filename'    => $filename,
                'headers'     => $importService->getCsvHeaders(),
                'csv_content' => $csvContent,
                'csv_text'    => $csvContent,
            ], 'Lấy mẫu CSV nhập bài đăng Threads thành công.');
        }

        return response($csvContent, 200, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }
}
