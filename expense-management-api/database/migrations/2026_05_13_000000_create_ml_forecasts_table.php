<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ml_forecasts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('category_id')->nullable();
            $table->integer('month');
            $table->integer('year');
            $table->decimal('projected_amount', 15, 2);
            $table->decimal('budget_amount', 15, 2);
            $table->decimal('spent_so_far', 15, 2)->default(0);
            $table->string('alert_tier', 20)->nullable();
            $table->timestamps();

            $table->unique(
                ['context_id', 'month', 'year', 'category_id'],
                'ml_forecasts_unique'
            );

            $table->foreign('context_id')
                  ->references('id')->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('category_id')
                  ->references('id')->on('categories')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ml_forecasts');
    }
};
