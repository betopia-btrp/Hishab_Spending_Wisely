<?php

namespace App\Services;

use App\Models\Context;
use App\Models\ContextMember;
use App\Models\User;
use App\Notifications\JoinRequestNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

class ContextService
{
    /**
     * FR-CT-01
     * Called right after user registration — always inside a DB transaction.
     */
    public function createPersonalContext(User $user): Context
    {
        $context = Context::create([
            'owner_id'    => $user->id,
            'name'        => "{$user->name}'s Personal",
            'type'        => 'personal',
            'invite_code' => null,
        ]);

        ContextMember::create([
            'context_id' => $context->id,
            'user_id'    => $user->id,
            'role'       => 'admin',
            'status'     => 'active',
        ]);

        return $context;
    }

    /**
     * FR-CT-02, FR-CT-04, FR-CT-07
     * Create a group context, enforce plan limits, assign admin role.
     */
    public function createGroup(User $user, array $data): Context
    {
        // FR-CT-07: enforce group limit by plan
        $this->enforceGroupLimit($user);

        return DB::transaction(function () use ($user, $data) {
            $context = Context::create([
                'owner_id'    => $user->id,
                'name'        => $data['name'],
                'type'        => 'group',
                'description' => $data['description'] ?? null,
                'invite_code' => $this->generateUniqueInviteCode(),
            ]);

            // FR-CT-04: creator gets admin role
            ContextMember::create([
                'context_id' => $context->id,
                'user_id'    => $user->id,
                'role'       => 'admin',
                'status'     => 'active',
            ]);

            return $context;
        });
    }

    /**
     * FR-CT-03, FR-CT-08
     * Join a group via invite code. Status starts as 'pending'.
     */
    public function joinGroup(User $user, string $inviteCode): Context
    {
        $context = Context::where('invite_code', $inviteCode)
            ->where('type', 'group')
            ->firstOrFail();

        // Already a member?
        $existing = ContextMember::where('context_id', $context->id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing) {
            if ($existing->status === 'removed') {
                throw ValidationException::withMessages([
                    'invite_code' => 'You have been removed from this group.',
                ]);
            }
            throw ValidationException::withMessages([
                'invite_code' => 'You are already a member of this group.',
            ]);
        }

        // FR-CT-08: enforce member limit
        $this->enforceMemberLimit($context);

        // FR-CT-04: new joiners get member role, status active (auto-joined)
        ContextMember::create([
            'context_id' => $context->id,
            'user_id'    => $user->id,
            'role'       => 'member',
            'status'     => 'active',
        ]);

        return $context->load('members.user');
    }

    /**
     * FR-CT-05: Admin approves a pending member.
     */
    public function approveMember(Context $context, string $userId): ContextMember
    {
        $member = ContextMember::where('context_id', $context->id)
            ->where('user_id', $userId)
            ->where('status', 'pending')
            ->firstOrFail();

        // Check member limit again before approving
        $this->enforceMemberLimit($context);

        $member->update(['status' => 'active']);

        // Notify the user about approval
        $member->user->notify(new JoinRequestNotification($member->user, $context, 'approved'));

        return $member->fresh('user');
    }

    /**
     * FR-CT-05: Admin removes a member.
     */
    public function removeMember(Context $context, string $userId): void
    {
        // Cannot remove yourself if you are the only admin
        $member = ContextMember::where('context_id', $context->id)
            ->where('user_id', $userId)
            ->firstOrFail();

        if ($member->role === 'admin') {
            throw ValidationException::withMessages([
                'user_id' => 'Cannot remove the group admin. Transfer admin rights first.',
            ]);
        }

        $member->update(['status' => 'removed']);
    }

    /**
     * FR-CT-05: Transfer admin rights to another active member.
     */
    public function transferAdmin(Context $context, User $currentAdmin, string $newAdminUserId): void
    {
        $newAdminMember = ContextMember::where('context_id', $context->id)
            ->where('user_id', $newAdminUserId)
            ->where('status', 'active')
            ->firstOrFail();

        DB::transaction(function () use ($context, $currentAdmin, $newAdminMember) {
            // Demote current admin
            ContextMember::where('context_id', $context->id)
                ->where('user_id', $currentAdmin->id)
                ->update(['role' => 'member']);

            // Promote new admin
            $newAdminMember->update(['role' => 'admin']);

            // Transfer context ownership
            $context->update(['owner_id' => $newAdminMember->user_id]);
        });
    }

    /**
     * FR-CT-05: Revoke and regenerate the invite code.
     */
    public function revokeInviteCode(Context $context): Context
    {
        $context->update([
            'invite_code' => $this->generateUniqueInviteCode(),
        ]);

        return $context->fresh();
    }

    /**
     * FR-CT-06: Return all contexts the user has access to.
     * Used to power the context switcher on the frontend.
     */
    public function getUserContexts(User $user): array
    {
        $personal = Context::whereHas('members', function ($q) use ($user) {
            $q->where('user_id', $user->id)->where('status', 'active');
        })->where('type', 'personal')->first();

        $groups = Context::whereHas('members', function ($q) use ($user) {
            $q->where('user_id', $user->id)->where('status', 'active');
        })->where('type', 'group')
          ->with(['members' => fn($q) => $q->where('status', 'active')->with('user')])
          ->get();

        return [
            'personal' => $personal,
            'groups'   => $groups,
        ];
    }

    // ─── Private Helpers ────────────────────────────────────────────────────

    /**
     * FR-CT-07: Free plan = max 1 group.
     */
    private function enforceGroupLimit(User $user): void
    {
        $plan = $user->plan;

        if (!$plan || $plan->max_groups === -1) {
            return; // unlimited (Pro)
        }

        $existingGroupCount = Context::where('owner_id', $user->id)
            ->where('type', 'group')
            ->count();

        if ($existingGroupCount >= $plan->max_groups) {
            throw ValidationException::withMessages([
                'plan' => "Your plan allows a maximum of {$plan->max_groups} group(s). Upgrade to Pro for unlimited groups.",
            ]);
        }
    }

    /**
     * FR-CT-08: Enforce max members per group.
     */
    private function enforceMemberLimit(Context $context): void
    {
        $owner = $context->owner()->with('plan')->first();
        $plan  = $owner?->plan;

        if (!$plan || $plan->max_members_per_group === -1) {
            return; // unlimited
        }

        $activeMemberCount = $context->activeMembers()->count();

        if ($activeMemberCount >= $plan->max_members_per_group) {
            throw ValidationException::withMessages([
                'plan' => "This group has reached the maximum of {$plan->max_members_per_group} members.",
            ]);
        }
    }

    /**
     * Generate a unique 8-character uppercase invite code.
     */
    private function generateUniqueInviteCode(): string
    {
        do {
            $code = strtoupper(Str::random(8));
        } while (Context::where('invite_code', $code)->exists());

        return $code;
    }
}
