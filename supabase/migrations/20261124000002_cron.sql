-- Scheduler: every two minutes, call the tick function. Needs app_config.functions_url, set by the deploy workflow.
create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into public.app_config (key, value)
values ('cron_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
on conflict (key) do nothing;

select cron.schedule(
  'pitchside-tick',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select value from public.app_config where key = 'functions_url') || '/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-pitchside-secret', (select value from public.app_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.app_config where key = 'functions_url');
  $$
);
