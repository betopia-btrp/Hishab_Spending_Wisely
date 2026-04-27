<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    use HasUuids;

    protected $keyType    = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'name',
        'price_monthly',
        'price_yearly',
        'max_groups',
        'max_members_per_group',
        'stripe_price_monthly_id',
        'stripe_price_yearly_id',
    ];

    protected $casts = [];

    public function users()
    {
        return $this->hasMany(User::class);
    }
}
