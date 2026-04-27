<?php

namespace App\Notifications;

use App\Mail\ReminderMail;
use App\Models\Reminder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class ReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Reminder $reminder) {}

    /**
     * Deliver via database (in-app) AND mail.
     */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    /**
     * In-app notification payload stored in notifications table.
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'reminder_id'  => $this->reminder->id,
            'title'        => $this->reminder->title,
            'description'  => $this->reminder->description,
            'context_id'   => $this->reminder->context_id,
            'remind_at'    => $this->reminder->remind_at->toISOString(),
            'is_recurring' => $this->reminder->isRecurring(),
        ];
    }

    /**
     * Email — reuse the ReminderMail Mailable.
     */
    public function toMail(object $notifiable): ReminderMail
    {
        return new ReminderMail($this->reminder, $notifiable);
    }
}