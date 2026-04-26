<?php

namespace App\Http\Requests\Expense;

use Illuminate\Foundation\Http\FormRequest;

class StoreCategoryRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id' => ['required', 'uuid', 'exists:contexts,id'],
            'name'       => ['required', 'string', 'max:100'],
            'icon'       => ['nullable', 'string', 'max:10'],
        ];
    }
}
