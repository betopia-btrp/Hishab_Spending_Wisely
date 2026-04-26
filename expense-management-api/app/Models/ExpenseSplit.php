<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ExpenseSplit extends Model
{
    use HasUuids;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'expense_id',
        'user_id',
        'share_amount',
        'percentage',
    ];

    protected $casts = [
        'share_amount' => 'decimal:2',
        'percentage'   => 'decimal:4',
    ];

    public function expense()
    {
        return $this->belongsTo(Expense::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
