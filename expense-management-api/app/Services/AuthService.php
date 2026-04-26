<?php

namespace App\Services;

use App\Models\Context;
use App\Models\ContextMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AuthService
{
    public function __construct(private ContextService $contextService) {}

    /**
     * Register a new user and auto-create their personal context.
     */
    public function register(array $data): User
    {
        return DB::transaction(function () use ($data) {
        $freePlan = \App\Models\Plan::where('name', 'free')->first();

            $user = User::create([
                'plan_id'  => $freePlan?->id,
                'name'     => $data['name'],
                'email'    => $data['email'],
                'password' => $data['password'], // hashed via cast
            ]);

            // FR-CT-01: auto-create personal context
            $this->contextService->createPersonalContext($user);

            return $user;
        });
    }

    /**
     * Find or create a user from Google OAuth payload.
     */
    public function findOrCreateFromGoogle(object $googleUser): User
    {
        return DB::transaction(function () use ($googleUser) {

            $user = User::where('google_id', $googleUser->getId())
                ->orWhere('email', $googleUser->getEmail())
                ->first();

            if ($user) {
                // Link Google account if not already linked
                if (!$user->google_id) {
                    $user->update([
                        'google_id' => $googleUser->getId()
                    ]);
                }

                return $user;
            }
             $freePlan = \App\Models\Plan::where('name', 'free')->first();

            // Create new OAuth user
            $user = User::create([
                'plan_id'            => $freePlan?->id,
                'name'               => $googleUser->getName(),
                'email'              => $googleUser->getEmail(),
                'google_id'          => $googleUser->getId(),
                'avatar_url'         => $googleUser->getAvatar(),
                'password'           => null,
                'email_verified_at'  => now(),
            ]);
            $this->contextService->createPersonalContext($user);


            return $user;
        });
    }

    /**
     * Create personal context and assign user as admin.
     */
    private function createPersonalContext(User $user): void
    {
        $context = Context::create([
            'owner_id'    => $user->id,
            'name'        => "{$user->name}'s Personal",
            'type'        => 'personal',
            'invite_code' => null, // no invite for personal
        ]);

        ContextMember::create([
            'context_id' => $context->id,
            'user_id'    => $user->id,
            'role'       => 'admin',
            'status'     => 'active',
        ]);
    }
}