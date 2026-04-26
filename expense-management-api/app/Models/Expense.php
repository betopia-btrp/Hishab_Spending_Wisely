<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Expense extends Model
{
    use HasUuids, SoftDeletes;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'context_id',
        'category_id',
        'created_by',
        'amount',
        'expense_date',
        'note',
        'split_type',
        'is_settled',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'expense_date' => 'date',
        'is_settled'   => 'boolean',
    ];

    public function context()
    {
        return $this->belongsTo(Context::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function splits()
    {
        return $this->hasMany(ExpenseSplit::class);
    }
}
