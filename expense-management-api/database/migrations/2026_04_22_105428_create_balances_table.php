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
        // Stores net balance between every pair of users within a context.
        // Canonical direction: from_user_id < to_user_id (lower UUID first).
        // Positive amount = from_user owes to_user.
        // Negative amount = to_user owes from_user.
        Schema::create('balances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('from_user_id');   // always the lower UUID
            $table->uuid('to_user_id');     // always the higher UUID
            $table->decimal('amount', 15, 2)->default(0);
            $table->timestamps();

            $table->unique(['context_id', 'from_user_id', 'to_user_id']);

            $table->foreign('context_id')
                  ->references('id')
                  ->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('from_user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');

            $table->foreign('to_user_id')
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
        Schema::dropIfExists('balances');
    }
};
