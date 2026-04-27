<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Budget extends Model
{
    use HasUuids;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'context_id',
        'category_id',
        'month',
        'year',
        'amount',
        'description',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'month'  => 'integer',
        'year'   => 'integer',
    ];

    public function context()
    {
        return $this->belongsTo(Context::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }
}