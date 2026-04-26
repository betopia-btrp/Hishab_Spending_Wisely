<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('expense_splits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('expense_id');
            $table->uuid('user_id');
            $table->decimal('share_amount', 15, 2);      // computed or entered
            $table->decimal('percentage', 8, 4)->nullable(); // for % split type
            $table->timestamps();

            $table->unique(['expense_id', 'user_id']);

            $table->foreign('expense_id')
                  ->references('id')
                  ->on('expenses')
                  ->onDelete('cascade');

            $table->foreign('user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('expense_splits');
    }
};
