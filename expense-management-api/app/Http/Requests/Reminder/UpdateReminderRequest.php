<?php

namespace App\Http\Requests\Reminder;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateReminderRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'user_id'             => ['nullable', 'uuid', 'exists:users,id'],
            'title'               => ['sometimes', 'string', 'max:200'],
            'description'         => ['nullable', 'string', 'max:1000'],
            'remind_at'           => ['sometimes', 'date', 'after:now'],
            'recurrence_type'     => ['sometimes', Rule::in(['none', 'daily', 'weekly', 'monthly', 'yearly'])],
            'recurrence_interval' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ];
    }
}