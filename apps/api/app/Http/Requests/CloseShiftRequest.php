<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CloseShiftRequest extends FormRequest
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
            'actual_cash'       => 'required|numeric|min:0',
            'carried_over_cash' => 'nullable|numeric|min:0',
            'notes'             => 'nullable|string|max:1000',
        ];
    }

    /**
     * Custom messages for validation errors.
     */
    public function messages(): array
    {
        return [
            'actual_cash.required' => 'Vui lòng nhập số tiền mặt thực tế kiểm đếm khi đóng ca.',
            'actual_cash.numeric'  => 'Số tiền mặt thực tế phải là một số hợp lệ.',
            'actual_cash.min'      => 'Số tiền mặt thực tế không được là số âm.',
        ];
    }
}
