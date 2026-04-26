<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Food & Dining',     'icon' => '🍽️'],
            ['name' => 'Transportation',    'icon' => '🚗'],
            ['name' => 'Shopping',          'icon' => '🛍️'],
            ['name' => 'Entertainment',     'icon' => '🎬'],
            ['name' => 'Health & Medical',  'icon' => '💊'],
            ['name' => 'Utilities',         'icon' => '💡'],
            ['name' => 'Rent & Housing',    'icon' => '🏠'],
            ['name' => 'Education',         'icon' => '📚'],
            ['name' => 'Travel',            'icon' => '✈️'],
            ['name' => 'Groceries',         'icon' => '🛒'],
            ['name' => 'Personal Care',     'icon' => '🧴'],
            ['name' => 'Others',            'icon' => '📦'],
        ];

        foreach ($categories as $category) {
            DB::table('categories')->insert([
                'id'         => Str::uuid(),
                'context_id' => null,
                'created_by' => null,
                'name'       => $category['name'],
                'icon'       => $category['icon'],
                'is_system'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
