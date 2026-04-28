Table users {
  id           uuid        [pk]
  plan_id      uuid        [ref: > plans.id]
  name         varchar(255) [not null]
  email        varchar(255) [unique, not null]
  password     varchar(255)
  avatar_url   varchar(255)
  google_id    varchar(255) [unique]
  is_premium   boolean     [not null, default: false]
  stripe_customer_id      varchar(255) [unique]
  stripe_subscription_id  varchar(255) [unique]
  email_verified_at  timestamp
  remember_token     varchar(100)
  created_at  timestamp
  updated_at  timestamp
  deleted_at  timestamp
}

Table plans {
  id                      uuid     [pk]
  name                    varchar(255) [not null]
  price_monthly           numeric  [not null, default: 0]
  price_yearly            numeric  [not null, default: 0]
  max_groups              int      [not null, default: 1]
  max_members_per_group   int      [not null, default: 4]
  stripe_price_monthly_id varchar(255)
  stripe_price_yearly_id  varchar(255)
  created_at  timestamp
  updated_at  timestamp
}

Table contexts {
  id          uuid        [pk]
  owner_id    uuid        [not null, ref: > users.id]
  name        varchar(255) [not null]
  type        varchar(255) [not null]
  description text
  invite_code varchar(255) [unique]
  created_at  timestamp
  updated_at  timestamp
  deleted_at  timestamp
}

Table context_members {
  id         uuid        [pk]
  context_id uuid        [not null, ref: > contexts.id]
  user_id    uuid        [not null, ref: > users.id]
  role       varchar(255) [not null, default: 'member']
  status     varchar(255) [not null, default: 'pending']
  created_at timestamp
  updated_at timestamp

  indexes {
    (context_id, user_id) [unique]
  }
}

Table categories {
  id         uuid        [pk]
  context_id uuid        [ref: > contexts.id]
  created_by uuid        [ref: > users.id]
  name       varchar(255) [not null]
  icon       varchar(255)
  is_system  boolean     [not null, default: false]
  created_at timestamp
  updated_at timestamp
  deleted_at timestamp
}

Table expenses {
  id           uuid          [pk]
  context_id   uuid          [not null, ref: > contexts.id]
  category_id  uuid          [ref: > categories.id]
  created_by   uuid          [not null, ref: > users.id]
  amount       decimal(15,2) [not null]
  expense_date date          [not null]
  note         varchar(255)
  split_type   varchar(255)  [not null, default: 'none']
  is_settled   boolean       [not null, default: false]
  created_at   timestamp
  updated_at   timestamp
  deleted_at   timestamp
}

Table expense_splits {
  id           uuid          [pk]
  expense_id   uuid          [not null, ref: > expenses.id]
  user_id      uuid          [not null, ref: > users.id]
  share_amount decimal(15,2) [not null]
  percentage   decimal(8,4)
  created_at   timestamp
  updated_at   timestamp

  indexes {
    (expense_id, user_id) [unique]
  }
}

Table balances {
  id           uuid          [pk]
  context_id   uuid          [not null, ref: > contexts.id]
  from_user_id uuid          [not null, ref: > users.id]
  to_user_id   uuid          [not null, ref: > users.id]
  amount       decimal(15,2) [not null, default: 0]
  created_at   timestamp
  updated_at   timestamp

  indexes {
    (context_id, from_user_id, to_user_id) [unique]
  }
}

Table budgets {
  id          uuid          [pk]
  context_id  uuid          [not null, ref: > contexts.id]
  category_id uuid          [ref: > categories.id]
  month       int           [not null]
  year        int           [not null]
  amount      decimal(15,2) [not null]
  description varchar(255)
  created_at  timestamp
  updated_at  timestamp

  indexes {
    (context_id, month, year, description) [unique]
  }
}

Table settlements {
  id          uuid          [pk]
  context_id  uuid          [not null, ref: > contexts.id]
  payer_id    uuid          [not null, ref: > users.id]
  receiver_id uuid          [not null, ref: > users.id]
  amount      decimal(15,2) [not null]
  method      varchar(255)
  note        varchar(255)
  created_at  timestamp
  updated_at  timestamp
  deleted_at  timestamp
}

Table reminders {
  id                  uuid      [pk]
  context_id          uuid      [not null, ref: > contexts.id]
  created_by          uuid      [not null, ref: > users.id]
  user_id             uuid      [ref: > users.id]
  title               varchar(255) [not null]
  description         text
  remind_at           timestamp [not null]
  is_completed        boolean   [not null, default: false]
  recurrence_type     varchar(255) [not null, default: 'none']
  recurrence_interval int       [not null, default: 1]
  next_occurrence_at  timestamp
  created_at          timestamp
  updated_at          timestamp
  deleted_at          timestamp
}

Table notifications {
  id              uuid      [pk]
  type            varchar(255) [not null]
  notifiable_type varchar(255) [not null]
  notifiable_id   uuid      [not null]
  data            text      [not null]
  read_at         timestamp
  created_at      timestamp
  updated_at      timestamp
}

// Infrastructure / Laravel tables (optional — omit if you only want domain tables)

Table sessions {
  id            varchar(255) [pk]
  user_id       bigint
  ip_address    varchar(45)
  user_agent    text
  payload       text         [not null]
  last_activity int          [not null]
}

Table personal_access_tokens {
  id             bigint       [pk, increment]
  tokenable_type varchar(255) [not null]
  tokenable_id   bigint       [not null]
  name           text         [not null]
  token          varchar(64)  [unique, not null]
  abilities      text
  last_used_at   timestamp
  expires_at     timestamp
  created_at     timestamp
  updated_at     timestamp
}

Table password_reset_tokens {
  email      varchar(255) [pk]
  token      varchar(255) [not null]
  created_at timestamp
}

Table jobs {
  id           bigint  [pk, increment]
  queue        varchar(255) [not null]
  payload      text    [not null]
  attempts     smallint [not null]
  reserved_at  int
  available_at int     [not null]
  created_at   int     [not null]
}

Table failed_jobs {
  id         bigint  [pk, increment]
  uuid       varchar(255) [unique, not null]
  connection text    [not null]
  queue      text    [not null]
  payload    text    [not null]
  exception  text    [not null]
  failed_at  timestamp [not null, default: `now()`]
}
