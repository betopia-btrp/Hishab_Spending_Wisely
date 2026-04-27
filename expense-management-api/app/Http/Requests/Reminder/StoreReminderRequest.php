<?php

namespace App\Http\Requests\Reminder;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreReminderRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id'          => ['required', 'uuid', 'exists:contexts,id'],
            'user_id'             => ['nullable', 'uuid', 'exists:users,id'],
            'title'               => ['required', 'string', 'max:200'],
            'description'         => ['nullable', 'string', 'max:1000'],
            'remind_at'           => ['required', 'date', 'after:now'],

            // FR-RE-02: Recurring — Pro only (enforced in controller)
            'recurrence_type'     => ['sometimes', Rule::in(['none', 'daily', 'weekly', 'monthly', 'yearly'])],
            'recurrence_interval' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ];
    }

    public function messages(): array
    {
        return [
            'remind_at.after'  => 'The reminder time must be in the future.',
            'user_id.exists'   => 'The specified target user does not exist.',
        ];
    }
}