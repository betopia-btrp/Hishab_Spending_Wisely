<?php

namespace App\Http\Requests\Reminder;

use Illuminate\Foundation\Http\FormRequest;

class ListReminderRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id'   => ['required', 'uuid', 'exists:contexts,id'],
            'status'       => ['nullable', 'in:pending,completed,all'],
            'per_page'     => ['nullable', 'integer', 'min:1', 'max:100'],
        ];
    }
}