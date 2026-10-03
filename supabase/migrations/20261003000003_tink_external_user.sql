alter table connections
  add column if not exists tink_external_user_id text;

update connections
   set tink_external_user_id = user_id::text
 where tink_external_user_id is null;

alter table connections
  alter column tink_external_user_id set not null,
  alter column tink_user_id drop not null;

alter table oauth_states
  add column if not exists tink_external_user_id text;

update oauth_states
   set tink_external_user_id = user_id::text
 where tink_external_user_id is null;

alter table oauth_states
  alter column tink_external_user_id set not null,
  alter column tink_user_id drop not null;
