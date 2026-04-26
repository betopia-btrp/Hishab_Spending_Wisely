<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Tymon\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    use HasFactory, Notifiable, SoftDeletes, HasUuids;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'plan_id',
        'name',
        'email',
        'password',
        'avatar_url',
        'google_id',
        'is_premium',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'google_id',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_premium' => 'boolean',
        'password' => 'hashed',
    ];

    // JWT required methods
    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [];
    }

    // Relationships

    //Plan and User:
    public function plan()
    {
        return $this->belongsTo(Plan::class);
    }
    //context and user:
    public function ownedContexts()
    {
        return $this->hasMany(Context::class, 'owner_id');
    }

    public function contextMemberships()
    {
        return $this->hasMany(ContextMember::class);
    }

    public function activeContexts()
    {
        return $this->hasManyThrough(
            Context::class,
            ContextMember::class,
            'user_id',
            'id',
            'id',
            'context_id'
        )->where('context_members.status', 'active');
    }

    public function sendPasswordResetNotification($token): void
    {
        $url = env('FRONTEND_URL') . '/reset-password?token=' . $token . '&email=' . urlencode($this->email);
        $this->notify(new \App\Notifications\PasswordResetNotification($url));
    }
}
