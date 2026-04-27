<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('plans')->insert([
            [
                'id'                   => Str::uuid(),
                'name'                 => 'free',
                'price_monthly'        => 0,
                'price_yearly'         => 0,
                'max_groups'           => 1,
                'max_members_per_group'=> 5,
                'custom_categories'    => false,
                'budget_rollover'      => false,
                'created_at'           => now(),
                'updated_at'           => now(),
            ],
            [
                'id'                   => Str::uuid(),
                'name'                 => 'pro',
                'price_monthly'        => 499.99,
                'price_yearly'         => 3999.99,
                'max_groups'           => -1,    // -1 = unlimited
                'max_members_per_group'=> -1,
                'custom_categories'    => true,
                'budget_rollover'      => true,
                'created_at'           => now(),
                'updated_at'           => now(),
            ],
        ]);
    }
}
