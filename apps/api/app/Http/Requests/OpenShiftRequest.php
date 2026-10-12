<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OpenShiftRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'branch_id'    => 'nullable|integer|exists:branches,id',
            'opening_cash' => 'required|numeric|min:0',
            'notes'        => 'nullable|string|max:1000',
        ];
    }

    /**
     * Custom messages for validation errors.
     */
    public function messages(): array
    {
        return [
            'opening_cash.required' => 'Vui lòng nhập số tiền mặt đầu ca.',
            'opening_cash.numeric'  => 'Số tiền mặt đầu ca phải là số hợp lệ.',
            'opening_cash.min'      => 'Số tiền mặt đầu ca không được âm.',
            'branch_id.exists'      => 'Chi nhánh đã chọn không tồn tại trên hệ thống.',
        ];
    }
}
