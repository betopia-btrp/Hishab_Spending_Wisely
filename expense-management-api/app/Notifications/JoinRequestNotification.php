<?php

namespace App\Notifications;

use App\Models\Context;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class JoinRequestNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public User $user,
        public Context $context,
        public string $status = 'pending'
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Join Request from {$this->user->name}")
            ->line("{$this->user->name} wants to join {$this->context->name}.")
            ->action('Approve Request', url('/'))
            ->line('Thank you for using our application!');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'join_request',
            'user_id' => $this->user->id,
            'user_name' => $this->user->name,
            'user_avatar' => $this->user->avatar_url,
            'context_id' => $this->context->id,
            'context_name' => $this->context->name,
            'status' => $this->status,
            'message' => "{$this->user->name} wants to join {$this->context->name}",
        ];
    }
}