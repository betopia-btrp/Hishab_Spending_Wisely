<?php

namespace App\Http\Requests\Expense;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id'   => ['required', 'uuid', 'exists:contexts,id'],
            'description' => ['nullable', 'string', 'max:255'],
            'category_id'  => ['nullable', 'uuid', 'exists:categories,id'],
            'amount'       => ['required', 'numeric', 'min:0.01'],
            'expense_date' => ['required', 'date'],
            'note'         => ['nullable', 'string', 'max:500'],
            'split_type'   => ['required', Rule::in(['none', 'equal', 'custom', 'percentage'])],

            // For custom split
            'splits'                  => ['required_if:split_type,custom,percentage', 'array'],
            'splits.*.user_id'        => ['required_if:split_type,custom,percentage', 'uuid', 'exists:users,id'],
            'splits.*.share_amount'   => ['required_if:split_type,custom', 'numeric', 'min:0.01'],
            'splits.*.percentage'     => ['required_if:split_type,percentage', 'numeric', 'min:0.01', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'splits.*.user_id.required_if'      => 'Each split must have a valid user.',
            'splits.*.share_amount.required_if'  => 'Each split must have a share amount for custom split.',
            'splits.*.percentage.required_if'    => 'Each split must have a percentage for percentage split.',
        ];
    }
}
