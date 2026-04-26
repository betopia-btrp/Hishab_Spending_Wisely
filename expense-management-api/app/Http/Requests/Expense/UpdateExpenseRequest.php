<?php

namespace App\Http\Requests\Expense;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateExpenseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'category_id'  => ['nullable', 'uuid', 'exists:categories,id'],
            'amount'       => ['sometimes', 'numeric', 'min:0.01'],
            'expense_date' => ['sometimes', 'date'],
            'note'         => ['nullable', 'string', 'max:500'],
            'split_type'   => ['sometimes', Rule::in(['none', 'equal', 'custom', 'percentage'])],

            'splits'                  => ['required_if:split_type,custom,percentage', 'array'],
            'splits.*.user_id'        => ['required_if:split_type,custom,percentage', 'uuid', 'exists:users,id'],
            'splits.*.share_amount'   => ['required_if:split_type,custom', 'numeric', 'min:0.01'],
            'splits.*.percentage'     => ['required_if:split_type,percentage', 'numeric', 'min:0.01', 'max:100'],
        ];
    }
}
