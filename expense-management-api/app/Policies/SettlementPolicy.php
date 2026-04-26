<?php

namespace App\Policies;

use App\Models\ContextMember;
use App\Models\User;

class SettlementPolicy
{
    /**
     * Only active members of the context can record or view settlements.
     */
    public function access(User $user, string $contextId): bool
    {
        return ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }
}