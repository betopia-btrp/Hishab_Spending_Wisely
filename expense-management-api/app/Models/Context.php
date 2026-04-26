<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Context extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'owner_id',
        'name',
        'type',
        'description',
        'invite_code',
    ];

    // Relationships

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members()
    {
        return $this->hasMany(ContextMember::class);
    }

    public function activeMembers()
    {
        return $this->hasMany(ContextMember::class)->where('status', 'active');
    }

    public function pendingMembers()
    {
        return $this->hasMany(ContextMember::class)->where('status', 'pending');
    }
}
