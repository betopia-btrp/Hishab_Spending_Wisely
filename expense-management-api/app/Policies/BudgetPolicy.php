<?php

namespace App\Policies;

use App\Models\Budget;
use App\Models\ContextMember;
use App\Models\User;

class BudgetPolicy
{
    /**
     * Any active context member can view budgets.
     */
    public function view(User $user, string $contextId): bool
    {
        return ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }

    /**
     * For personal context — the owner can manage budgets.
     * For group context — only admin can manage group budgets.
     */
    public function manage(User $user, string $contextId): bool
    {
        return ContextMember::where('context_id', $contextId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->where(function ($q) {
                $q->where('role', 'admin')
                  ->orWhereHas('context', fn($q) => $q->where('type', 'personal'));
            })
            ->exists();
    }

    /**
     * Same as manage — only who created or admin can modify.
     */
    public function update(User $user, Budget $budget): bool
    {
        return $this->manage($user, $budget->context_id);
    }

    public function delete(User $user, Budget $budget): bool
    {
        return $this->manage($user, $budget->context_id);
    }
}