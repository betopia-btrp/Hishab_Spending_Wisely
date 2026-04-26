<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Balance extends Model
{
    use HasUuids;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'context_id',
        'from_user_id',
        'to_user_id',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function context()
    {
        return $this->belongsTo(Context::class);
    }

    public function fromUser()
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser()
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }
}
