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
        Schema::create('settlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('payer_id');           // who paid
            $table->uuid('receiver_id');        // who received
            $table->decimal('amount', 15, 2);
            $table->string('method')->nullable(); // cash, bank, bkash, etc.
            $table->string('note')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('context_id')
                  ->references('id')
                  ->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('payer_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');

            $table->foreign('receiver_id')
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
        Schema::dropIfExists('settlements');
    }
};
