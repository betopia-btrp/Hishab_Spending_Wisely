<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reminders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('created_by');
            $table->uuid('user_id')->nullable();     // null = target all members
            $table->string('title');
            $table->text('description')->nullable();
            $table->timestamp('remind_at');
            $table->boolean('is_completed')->default(false);

            // FR-RE-02: Recurring (Pro only)
            $table->enum('recurrence_type', ['none', 'daily', 'weekly', 'monthly', 'yearly'])
                  ->default('none');
            $table->integer('recurrence_interval')->default(1); // every N days/weeks/etc.
            $table->timestamp('next_occurrence_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->foreign('context_id')
                  ->references('id')
                  ->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('created_by')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');

            $table->foreign('user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('set null');

            // Index for the scheduler query
            $table->index(['remind_at', 'is_completed']);
            $table->index(['next_occurrence_at', 'is_completed']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reminders');
    }
};