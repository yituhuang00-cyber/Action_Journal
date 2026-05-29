create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = tg_table_schema
      and table_name = tg_table_name
      and column_name = 'updated_at'
  ) then
    new.updated_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

create table if not exists public.app_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.goals (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  reasons jsonb not null default '[]'::jsonb,
  expected_outcome text not null default '',
  supports jsonb not null default '[]'::jsonb,
  factors jsonb not null default '[]'::jsonb,
  status text not null default 'want',
  start_date text not null default '',
  completed_date text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.goal_sub_targets (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null references public.goals (id) on delete cascade,
  position integer not null default 0,
  start_date text not null default '',
  end_date text not null default '',
  content text not null default '',
  status text not null default 'want',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.actions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null references public.goals (id) on delete cascade,
  start_time timestamptz,
  end_time timestamptz,
  expected_duration_minutes integer,
  expected_outcome text not null default '',
  content text not null default '',
  next_action text not null default '',
  scores jsonb not null default '{"arousal":0,"valence":0}'::jsonb,
  rant text not null default '',
  bingo text not null default '',
  celebration text not null default '',
  work_experience_title text not null default '',
  work_experience_html text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercise_goals (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  reasons jsonb not null default '[]'::jsonb,
  supports jsonb not null default '[]'::jsonb,
  status text not null default 'want',
  start_date text not null default '',
  completed_date text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercise_actions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null references public.exercise_goals (id) on delete cascade,
  start_time timestamptz,
  end_time timestamptz,
  exercise_name text not null default '',
  content text not null default '',
  scores jsonb not null default '{"arousal":0,"valence":0}'::jsonb,
  bingo text not null default '',
  celebration text not null default '',
  work_experience_title text not null default '',
  work_experience_html text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.writing_templates (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  purpose text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.writing_template_sections (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null references public.writing_templates (id) on delete cascade,
  position integer not null default 0,
  question text not null default '',
  prompt text not null default ''
);

create table if not exists public.writing_entries (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null references public.writing_templates (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.writing_entry_answers (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_id text not null references public.writing_entries (id) on delete cascade,
  section_id text not null default '',
  position integer not null default 0,
  content text not null default ''
);

create table if not exists public.weekly_plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_key text not null,
  start_date text not null default '',
  end_date text not null default '',
  confirmed_at text not null default '',
  sub_target_refs jsonb not null default '[]'::jsonb,
  primary key (user_id, week_key)
);

create table if not exists public.daily_plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date text not null,
  content text not null default '',
  primary key (user_id, plan_date)
);

create table if not exists public.daily_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_date text not null,
  content text not null default '',
  primary key (user_id, achievement_date)
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  conservative_minutes integer not null default 60,
  ambitious_minutes integer not null default 180
);

create index if not exists idx_goals_user_id on public.goals (user_id);
create index if not exists idx_goal_sub_targets_user_id on public.goal_sub_targets (user_id);
create index if not exists idx_actions_user_id on public.actions (user_id);
create index if not exists idx_exercise_goals_user_id on public.exercise_goals (user_id);
create index if not exists idx_exercise_actions_user_id on public.exercise_actions (user_id);
create index if not exists idx_writing_templates_user_id on public.writing_templates (user_id);
create index if not exists idx_writing_template_sections_user_id on public.writing_template_sections (user_id);
create index if not exists idx_writing_entries_user_id on public.writing_entries (user_id);
create index if not exists idx_writing_entry_answers_user_id on public.writing_entry_answers (user_id);

alter table public.app_states enable row level security;
alter table public.goals enable row level security;
alter table public.goal_sub_targets enable row level security;
alter table public.actions enable row level security;
alter table public.exercise_goals enable row level security;
alter table public.exercise_actions enable row level security;
alter table public.writing_templates enable row level security;
alter table public.writing_template_sections enable row level security;
alter table public.writing_entries enable row level security;
alter table public.writing_entry_answers enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_achievements enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "app_states_select_own" on public.app_states;
create policy "app_states_select_own" on public.app_states for select to authenticated using (auth.uid() = user_id);
drop policy if exists "app_states_insert_own" on public.app_states;
create policy "app_states_insert_own" on public.app_states for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "app_states_update_own" on public.app_states;
create policy "app_states_update_own" on public.app_states for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "app_states_delete_own" on public.app_states;
create policy "app_states_delete_own" on public.app_states for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "goals_select_own" on public.goals;
create policy "goals_select_own" on public.goals for select to authenticated using (auth.uid() = user_id);
drop policy if exists "goals_insert_own" on public.goals;
create policy "goals_insert_own" on public.goals for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "goals_update_own" on public.goals;
create policy "goals_update_own" on public.goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_delete_own" on public.goals;
create policy "goals_delete_own" on public.goals for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "goal_sub_targets_select_own" on public.goal_sub_targets;
create policy "goal_sub_targets_select_own" on public.goal_sub_targets for select to authenticated using (auth.uid() = user_id);
drop policy if exists "goal_sub_targets_insert_own" on public.goal_sub_targets;
create policy "goal_sub_targets_insert_own" on public.goal_sub_targets for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "goal_sub_targets_update_own" on public.goal_sub_targets;
create policy "goal_sub_targets_update_own" on public.goal_sub_targets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goal_sub_targets_delete_own" on public.goal_sub_targets;
create policy "goal_sub_targets_delete_own" on public.goal_sub_targets for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "actions_select_own" on public.actions;
create policy "actions_select_own" on public.actions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "actions_insert_own" on public.actions;
create policy "actions_insert_own" on public.actions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "actions_update_own" on public.actions;
create policy "actions_update_own" on public.actions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "actions_delete_own" on public.actions;
create policy "actions_delete_own" on public.actions for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "exercise_goals_select_own" on public.exercise_goals;
create policy "exercise_goals_select_own" on public.exercise_goals for select to authenticated using (auth.uid() = user_id);
drop policy if exists "exercise_goals_insert_own" on public.exercise_goals;
create policy "exercise_goals_insert_own" on public.exercise_goals for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "exercise_goals_update_own" on public.exercise_goals;
create policy "exercise_goals_update_own" on public.exercise_goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "exercise_goals_delete_own" on public.exercise_goals;
create policy "exercise_goals_delete_own" on public.exercise_goals for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "exercise_actions_select_own" on public.exercise_actions;
create policy "exercise_actions_select_own" on public.exercise_actions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "exercise_actions_insert_own" on public.exercise_actions;
create policy "exercise_actions_insert_own" on public.exercise_actions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "exercise_actions_update_own" on public.exercise_actions;
create policy "exercise_actions_update_own" on public.exercise_actions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "exercise_actions_delete_own" on public.exercise_actions;
create policy "exercise_actions_delete_own" on public.exercise_actions for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "writing_templates_select_own" on public.writing_templates;
create policy "writing_templates_select_own" on public.writing_templates for select to authenticated using (auth.uid() = user_id);
drop policy if exists "writing_templates_insert_own" on public.writing_templates;
create policy "writing_templates_insert_own" on public.writing_templates for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "writing_templates_update_own" on public.writing_templates;
create policy "writing_templates_update_own" on public.writing_templates for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "writing_templates_delete_own" on public.writing_templates;
create policy "writing_templates_delete_own" on public.writing_templates for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "writing_template_sections_select_own" on public.writing_template_sections;
create policy "writing_template_sections_select_own" on public.writing_template_sections for select to authenticated using (auth.uid() = user_id);
drop policy if exists "writing_template_sections_insert_own" on public.writing_template_sections;
create policy "writing_template_sections_insert_own" on public.writing_template_sections for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "writing_template_sections_update_own" on public.writing_template_sections;
create policy "writing_template_sections_update_own" on public.writing_template_sections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "writing_template_sections_delete_own" on public.writing_template_sections;
create policy "writing_template_sections_delete_own" on public.writing_template_sections for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "writing_entries_select_own" on public.writing_entries;
create policy "writing_entries_select_own" on public.writing_entries for select to authenticated using (auth.uid() = user_id);
drop policy if exists "writing_entries_insert_own" on public.writing_entries;
create policy "writing_entries_insert_own" on public.writing_entries for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "writing_entries_update_own" on public.writing_entries;
create policy "writing_entries_update_own" on public.writing_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "writing_entries_delete_own" on public.writing_entries;
create policy "writing_entries_delete_own" on public.writing_entries for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "writing_entry_answers_select_own" on public.writing_entry_answers;
create policy "writing_entry_answers_select_own" on public.writing_entry_answers for select to authenticated using (auth.uid() = user_id);
drop policy if exists "writing_entry_answers_insert_own" on public.writing_entry_answers;
create policy "writing_entry_answers_insert_own" on public.writing_entry_answers for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "writing_entry_answers_update_own" on public.writing_entry_answers;
create policy "writing_entry_answers_update_own" on public.writing_entry_answers for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "writing_entry_answers_delete_own" on public.writing_entry_answers;
create policy "writing_entry_answers_delete_own" on public.writing_entry_answers for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "weekly_plans_select_own" on public.weekly_plans;
create policy "weekly_plans_select_own" on public.weekly_plans for select to authenticated using (auth.uid() = user_id);
drop policy if exists "weekly_plans_insert_own" on public.weekly_plans;
create policy "weekly_plans_insert_own" on public.weekly_plans for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "weekly_plans_update_own" on public.weekly_plans;
create policy "weekly_plans_update_own" on public.weekly_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "weekly_plans_delete_own" on public.weekly_plans;
create policy "weekly_plans_delete_own" on public.weekly_plans for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "daily_plans_select_own" on public.daily_plans;
create policy "daily_plans_select_own" on public.daily_plans for select to authenticated using (auth.uid() = user_id);
drop policy if exists "daily_plans_insert_own" on public.daily_plans;
create policy "daily_plans_insert_own" on public.daily_plans for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "daily_plans_update_own" on public.daily_plans;
create policy "daily_plans_update_own" on public.daily_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "daily_plans_delete_own" on public.daily_plans;
create policy "daily_plans_delete_own" on public.daily_plans for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "daily_achievements_select_own" on public.daily_achievements;
create policy "daily_achievements_select_own" on public.daily_achievements for select to authenticated using (auth.uid() = user_id);
drop policy if exists "daily_achievements_insert_own" on public.daily_achievements;
create policy "daily_achievements_insert_own" on public.daily_achievements for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "daily_achievements_update_own" on public.daily_achievements;
create policy "daily_achievements_update_own" on public.daily_achievements for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "daily_achievements_delete_own" on public.daily_achievements;
create policy "daily_achievements_delete_own" on public.daily_achievements for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own" on public.user_settings for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists touch_app_states_updated_at on public.app_states;
create trigger touch_app_states_updated_at before update on public.app_states for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_goals_updated_at on public.goals;
create trigger touch_goals_updated_at before update on public.goals for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_goal_sub_targets_updated_at on public.goal_sub_targets;
create trigger touch_goal_sub_targets_updated_at before update on public.goal_sub_targets for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_actions_updated_at on public.actions;
create trigger touch_actions_updated_at before update on public.actions for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_exercise_goals_updated_at on public.exercise_goals;
create trigger touch_exercise_goals_updated_at before update on public.exercise_goals for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_exercise_actions_updated_at on public.exercise_actions;
create trigger touch_exercise_actions_updated_at before update on public.exercise_actions for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_writing_templates_updated_at on public.writing_templates;
create trigger touch_writing_templates_updated_at before update on public.writing_templates for each row execute procedure public.touch_updated_at();
drop trigger if exists touch_writing_entries_updated_at on public.writing_entries;
create trigger touch_writing_entries_updated_at before update on public.writing_entries for each row execute procedure public.touch_updated_at();
