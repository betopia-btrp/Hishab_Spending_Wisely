<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name'                  => 'free',
                'price_monthly'         => 0,
                'price_yearly'          => 0,
                'max_groups'            => 1,
                'max_members_per_group' => 4,
                'custom_categories'     => false,
                'budget_rollover'       => false,
                'stripe_price_monthly_id' => null,
                'stripe_price_yearly_id'  => null,
            ],
            [
                'name'                  => 'pro',
                'price_monthly'         => 9.99,
                'price_yearly'          => 99.99,
                'max_groups'            => -1,
                'max_members_per_group' => -1,
                'custom_categories'     => true,
                'budget_rollover'       => true,
                'stripe_price_monthly_id' => env('STRIPE_PRO_PRICE_MONTHLY'),
                'stripe_price_yearly_id'  => env('STRIPE_PRO_PRICE_YEARLY'),
            ],
        ];

        foreach ($plans as $plan) {
            DB::table('plans')->updateOrInsert(
                ['name' => $plan['name']],
                array_merge($plan, [
                    'id' => DB::table('plans')->where('name', $plan['name'])->value('id') ?? Str::uuid(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ])
            );
        }
    }
}
