<?php

namespace App\Http\Requests\Balance;

use Illuminate\Foundation\Http\FormRequest;

class RecordSettlementRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'context_id'  => ['required', 'uuid', 'exists:contexts,id'],
            'payer_id'    => ['required', 'uuid', 'exists:users,id'],
            'receiver_id' => ['required', 'uuid', 'exists:users,id', 'different:payer_id'],
            'amount'      => ['required', 'numeric', 'min:0.01'],
            'method'      => ['nullable', 'string', 'max:50'],
            'note'        => ['nullable', 'string', 'max:300'],
        ];
    }

    public function messages(): array
    {
        return [
            'receiver_id.different' => 'Payer and receiver must be different users.',
        ];
    }
}
