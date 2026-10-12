<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateExpenseRequest extends FormRequest
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
            'branch_id'        => 'nullable|integer|exists:branches,id',
            'amount'           => 'required|numeric|min:1',
            'category'         => 'required|string|in:purchasing_parts,shipping_cod,store_operations,refund,other_expense',
            'recipient_payer'  => 'nullable|string|max:255',
            'payment_method'   => 'nullable|string|in:cash,bank_transfer',
            'notes'            => 'nullable|string|max:1000',
        ];
    }

    /**
     * Custom messages for validation errors.
     */
    public function messages(): array
    {
        return [
            'amount.required'   => 'Vui lòng nhập số tiền chi.',
            'amount.numeric'    => 'Số tiền chi phải là một số hợp lệ.',
            'amount.min'        => 'Số tiền chi tối thiểu là 1 VNĐ.',
            'category.required' => 'Vui lòng chọn danh mục chi phí.',
            'category.in'       => 'Danh mục chi phí không hợp lệ.',
        ];
    }
}
