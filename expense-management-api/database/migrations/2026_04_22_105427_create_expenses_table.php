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
       Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('context_id');
            $table->uuid('category_id')->nullable();
            $table->uuid('created_by');              // who logged it
            $table->decimal('amount', 15, 2);
            $table->date('expense_date');
            $table->string('note')->nullable();
            $table->enum('split_type', ['none', 'equal', 'custom', 'percentage'])
                  ->default('none');
            $table->boolean('is_settled')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('context_id')
                  ->references('id')
                  ->on('contexts')
                  ->onDelete('cascade');

            $table->foreign('category_id')
                  ->references('id')
                  ->on('categories')
                  ->onDelete('set null');

            $table->foreign('created_by')
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
        Schema::dropIfExists('expenses');
    }
};
