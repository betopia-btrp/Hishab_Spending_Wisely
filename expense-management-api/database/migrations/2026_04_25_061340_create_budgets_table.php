<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('category_id')->nullable(); // NULL = overall budget
            $table->integer('month');               // 1–12
            $table->integer('year');
            $table->decimal('amount', 15, 2);
            $table->timestamps();

            // FR-BU-04: unique constraint prevents duplicates
            $table->unique(
                ['context_id', 'month', 'year', 'category_id'],
                'budgets_unique_context_month_year_category'
            );

            $table->foreign('context_id')
                  ->references('id')
                  ->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('category_id')
                  ->references('id')
                  ->on('categories')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('budgets');
    }
};