<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContextMember extends Model
{
    use HasFactory, HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'context_id',
        'user_id',
        'role',
        'status',
    ];

    public function context(): BelongsTo
    {
        return $this->belongsTo(Context::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
