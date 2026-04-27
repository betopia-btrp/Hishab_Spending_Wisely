<?php

namespace App\Models;

use GoldSpecDigital\LaravelEloquentUUID\Database\Eloquent\Uuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Reminder extends Model
{
    use Uuid, SoftDeletes;

    protected $keyType     = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'context_id',
        'created_by',
        'user_id',
        'title',
        'description',
        'remind_at',
        'is_completed',
        'recurrence_type',
        'recurrence_interval',
        'next_occurrence_at',
    ];

    protected $casts = [
        'remind_at'           => 'datetime',
        'next_occurrence_at'  => 'datetime',
        'is_completed'        => 'boolean',
        'recurrence_interval' => 'integer',
    ];

    // ─── Relationships ────────────────────────────────────────────────────

    public function context()
    {
        return $this->belongsTo(Context::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function targetUser()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    public function isRecurring(): bool
    {
        return $this->recurrence_type !== 'none';
    }

    /**
     * Advance next_occurrence_at by recurrence_interval units.
     */
    public function advanceNextOccurrence(): void
    {
        $base = $this->next_occurrence_at ?? $this->remind_at;

        $this->next_occurrence_at = match($this->recurrence_type) {
            'daily'   => $base->addDays($this->recurrence_interval),
            'weekly'  => $base->addWeeks($this->recurrence_interval),
            'monthly' => $base->addMonths($this->recurrence_interval),
            'yearly'  => $base->addYears($this->recurrence_interval),
            default   => null,
        };

        $this->save();
    }
}