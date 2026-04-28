@component('mail::message')
# ⏰ {{ $reminder->title }}

Hello **{{ $recipient->name }}**,

@if($reminder->description)
{{ $reminder->description }}
@endif

**Scheduled for:** {{ $reminder->remind_at->format('D, d M Y \a\t h:i A') }}

@if($reminder->isRecurring())
> This is a recurring reminder — repeats every {{ $reminder->recurrence_interval }} {{ $reminder->recurrence_type }}.
@endif

@component('mail::button', ['url' => config('app.frontend_url') . '/reminders', 'color' => 'green'])
View All Reminders
@endcomponent

Thanks,
{{ config('app.name') }}
@endcomponent