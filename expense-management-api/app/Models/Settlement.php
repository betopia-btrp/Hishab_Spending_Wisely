<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Settlement extends Model
{
    use HasUuids, SoftDeletes;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'context_id',
        'payer_id',
        'receiver_id',
        'amount',
        'method',
        'note',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function context()
    {
        return $this->belongsTo(Context::class);
    }

    public function payer()
    {
        return $this->belongsTo(User::class, 'payer_id');
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'receiver_id');
    }
}