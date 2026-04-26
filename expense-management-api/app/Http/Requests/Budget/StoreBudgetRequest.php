<?php

namespace App\Http\Requests\Budget;

use Illuminate\Foundation\Http\FormRequest;

class StoreBudgetRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id'  => ['required', 'uuid', 'exists:contexts,id'],
            'category_id' => ['nullable', 'uuid', 'exists:categories,id'],
            'month'       => ['required', 'integer', 'between:1,12'],
            'year'        => ['required', 'integer', 'min:2000', 'max:2100'],
            'amount'      => ['required', 'numeric', 'min:0.01'],
        ];
    }
}