<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
// routes/console.php
use App\Jobs\SendReminderNotifications;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');



Schedule::job(new SendReminderNotifications)
         ->everyMinute()
         ->withoutOverlapping();
