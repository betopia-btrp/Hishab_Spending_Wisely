<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('budgets', function (Blueprint $table) {
            $table->dropUnique('budgets_unique_context_month_year_category');
            $table->unique(
                ['context_id', 'month', 'year', 'description'],
                'budgets_unique_context_month_year_description'
            );
        });
    }

    public function down(): void
    {
        Schema::table('budgets', function (Blueprint $table) {
            $table->dropUnique('budgets_unique_context_month_year_description');
            $table->unique(
                ['context_id', 'month', 'year', 'category_id'],
                'budgets_unique_context_month_year_category'
            );
        });
    }
};