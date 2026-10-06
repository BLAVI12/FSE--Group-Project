-- Generated from seed-data/transaction-categories.json; do not edit by hand.

begin;

insert into public.categories (id, user_id, name) values

  ('ccc00e42-d6da-5b03-99a2-f33feb4cdd73', null, 'Income'),
  ('bac797df-6a1e-5e63-849a-4d4a8642a082', null, 'Housing'),
  ('e8c55b87-3903-5e19-9661-5cd58f54b5cf', null, 'Groceries'),
  ('f2b80525-b98a-52b5-9acd-a3f8e90da82f', null, 'Dining & Coffee'),
  ('89e10b33-c5de-5fa9-a4c2-17c7e5a85f6a', null, 'Transportation'),
  ('66a22a0b-7336-5ab8-8dfd-9a41d363772f', null, 'Shopping'),
  ('e63b0efe-689c-54f5-8d8c-a3d76d6cc296', null, 'Health'),
  ('17c4b645-ecca-5253-9d24-64dafd6d3398', null, 'Insurance'),
  ('a8eaf55b-679b-53c0-ae05-ad7bde17cd5c', null, 'Utilities'),
  ('f2172623-d53e-5d27-8f01-ad1cfe8971e4', null, 'Phone & Internet'),
  ('9bb2dfe9-9d94-5520-890e-c799cd4b377b', null, 'Subscriptions'),
  ('612547db-4fbd-50ae-aea1-d3f7fc9ac96a', null, 'Cash Withdrawal'),
  ('053d0f67-fecd-5ea5-9644-01147ac8b113', null, 'Transfers'),
  ('f9134716-429c-5c0e-b12c-22845ae33fa6', null, 'Uncategorized')
on conflict (id) do update set name = excluded.name, updated_at = now()
where public.categories.name is distinct from excluded.name;

insert into public.category_rules (
    id, user_id, category_id, keyword, normalized_keyword, match_fields, match_method, priority, active
) values
  ('3bcf4431-f8e2-59e5-b390-d17b91c0733e', null, 'ccc00e42-d6da-5b03-99a2-f33feb4cdd73', 'Salary', 'salary', array['original', 'display']::text[], 'contains', 0, true),
  ('c50eb44d-2a0e-5206-a307-f6f467d18b22', null, 'ccc00e42-d6da-5b03-99a2-f33feb4cdd73', 'Zinserträge', 'zinserträge', array['original', 'display']::text[], 'contains', 1, true),
  ('284c6e43-772d-5697-9a3f-fd0b3d32abd5', null, 'bac797df-6a1e-5e63-849a-4d4a8642a082', 'Miete', 'miete', array['original', 'display']::text[], 'contains', 2, true),
  ('3682bc3c-71c2-5420-800c-3da4aeec1216', null, 'e8c55b87-3903-5e19-9661-5cd58f54b5cf', 'Aldi', 'aldi', array['original', 'display']::text[], 'contains', 3, true),
  ('1e6a2bc2-54ce-51ba-87ba-c40ccda3d242', null, 'e8c55b87-3903-5e19-9661-5cd58f54b5cf', 'Edeka', 'edeka', array['original', 'display']::text[], 'contains', 4, true),
  ('e94b0859-88e9-5c64-9458-129a63fadfe2', null, 'e8c55b87-3903-5e19-9661-5cd58f54b5cf', 'Lidl', 'lidl', array['original', 'display']::text[], 'contains', 5, true),
  ('d7cd1ac2-f874-5a03-883a-d0cb6557a4fa', null, 'e8c55b87-3903-5e19-9661-5cd58f54b5cf', 'Rewe', 'rewe', array['original', 'display']::text[], 'contains', 6, true),
  ('c8113cc4-d3a9-5d82-8913-d42699d8d6f1', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Bar Celona', 'bar celona', array['original', 'display']::text[], 'contains', 7, true),
  ('b1ff4717-75b9-55ea-98ed-382639ed4c5f', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Burger King', 'burger king', array['original', 'display']::text[], 'contains', 8, true),
  ('fee6696d-0e7a-56a6-a7ad-8cb1cf26f543', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Coffee Fellows', 'coffee fellows', array['original', 'display']::text[], 'contains', 9, true),
  ('c3d0a330-ca81-527d-ae58-3e704c7f3ed0', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Maredo', 'maredo', array['original', 'display']::text[], 'contains', 10, true),
  ('977db2df-4e06-55a4-8f84-440762f5456c', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'McDonalds', 'mcdonalds', array['original', 'display']::text[], 'contains', 11, true),
  ('72af0292-3404-5c41-940f-a07ea88c5e92', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Sausalitos', 'sausalitos', array['original', 'display']::text[], 'contains', 12, true),
  ('b72f53c0-992b-5f6f-801a-3ea7df578ba1', null, 'f2b80525-b98a-52b5-9acd-a3f8e90da82f', 'Starbucks', 'starbucks', array['original', 'display']::text[], 'contains', 13, true),
  ('648aed29-c4bd-54e6-9c33-f3dad2cf2541', null, '89e10b33-c5de-5fa9-a4c2-17c7e5a85f6a', 'Deutsche Bahn', 'deutsche bahn', array['original', 'display']::text[], 'contains', 14, true),
  ('1b80d7f4-317a-5675-887d-6cdc46c29714', null, '89e10b33-c5de-5fa9-a4c2-17c7e5a85f6a', 'Flixbus', 'flixbus', array['original', 'display']::text[], 'contains', 15, true),
  ('4ca1e25e-b1ab-5215-a057-a7786bb5b558', null, '89e10b33-c5de-5fa9-a4c2-17c7e5a85f6a', 'Jet Tankstelle', 'jet tankstelle', array['original', 'display']::text[], 'contains', 16, true),
  ('75a7614c-9ec9-5c94-a4cf-38cc3adb4f2d', null, '66a22a0b-7336-5ab8-8dfd-9a41d363772f', 'Amazon', 'amazon', array['original', 'display']::text[], 'contains', 17, true),
  ('20cf240a-9454-5373-8770-25d8f6551da9', null, '66a22a0b-7336-5ab8-8dfd-9a41d363772f', 'H&M', 'h&m', array['original', 'display']::text[], 'contains', 18, true),
  ('d30d244e-fc95-5206-a157-99c4f76f7881', null, '66a22a0b-7336-5ab8-8dfd-9a41d363772f', 'Mediamarkt', 'mediamarkt', array['original', 'display']::text[], 'contains', 19, true),
  ('ba6d1f57-64af-524c-b5da-9d6df5175319', null, '66a22a0b-7336-5ab8-8dfd-9a41d363772f', 'Zalando', 'zalando', array['original', 'display']::text[], 'contains', 20, true),
  ('50b46f89-67f7-5256-b6b9-84f41a9bc5d6', null, 'e63b0efe-689c-54f5-8d8c-a3d76d6cc296', 'Adler Apotheke', 'adler apotheke', array['original', 'display']::text[], 'contains', 21, true),
  ('008a350d-95bd-58bb-9237-c3fd6dab5683', null, 'e63b0efe-689c-54f5-8d8c-a3d76d6cc296', 'Fielmann', 'fielmann', array['original', 'display']::text[], 'contains', 22, true),
  ('dff35ce0-b8cb-50ac-a8b1-43cb056e5765', null, '17c4b645-ecca-5253-9d24-64dafd6d3398', 'Allianz', 'allianz', array['original', 'display']::text[], 'contains', 23, true),
  ('b5fe8d46-83e8-57f0-a391-f5e65ad89584', null, 'a8eaf55b-679b-53c0-ae05-ad7bde17cd5c', 'E.ON', 'e.on', array['original', 'display']::text[], 'contains', 24, true),
  ('f5e8fdfa-23a9-550e-922c-d06c98196d7b', null, 'f2172623-d53e-5d27-8f01-ad1cfe8971e4', 'Telekom', 'telekom', array['original', 'display']::text[], 'contains', 25, true),
  ('a255a86a-48fa-5198-86c2-0abe71468190', null, 'f2172623-d53e-5d27-8f01-ad1cfe8971e4', 'Vodafone', 'vodafone', array['original', 'display']::text[], 'contains', 26, true),
  ('f7fca2b8-7382-51b7-8db8-7b05d43a159f', null, '9bb2dfe9-9d94-5520-890e-c799cd4b377b', 'Spotify', 'spotify', array['original', 'display']::text[], 'contains', 27, true),
  ('4adc352d-128f-5e89-8677-9a7593071088', null, '612547db-4fbd-50ae-aea1-d3f7fc9ac96a', 'Bargeldauszahlung', 'bargeldauszahlung', array['original', 'display']::text[], 'contains', 28, true),
  ('947d8c37-0558-5f01-abbe-3109a42fef0d', null, '053d0f67-fecd-5ea5-9644-01147ac8b113', 'Übertrag', 'übertrag', array['original', 'display']::text[], 'contains', 29, true)
on conflict (id) do update set
    category_id = excluded.category_id, keyword = excluded.keyword,
    normalized_keyword = excluded.normalized_keyword, match_fields = excluded.match_fields,
    match_method = excluded.match_method, priority = excluded.priority, active = excluded.active,
    updated_at = now()
where (public.category_rules.category_id, public.category_rules.keyword,
       public.category_rules.normalized_keyword, public.category_rules.match_fields,
       public.category_rules.match_method, public.category_rules.priority, public.category_rules.active)
  is distinct from (excluded.category_id, excluded.keyword, excluded.normalized_keyword,
                   excluded.match_fields, excluded.match_method, excluded.priority, excluded.active);

insert into public.exclusion_rules (
    id, user_id, pattern, normalized_pattern, match_fields, match_method, reason, active
) values
  ('3315747d-a1b9-5194-9425-8d6abc17e6b0', null, 'checkDestinationIBAN', 'checkdestinationiban', array['original', 'display']::text[], 'contains', 'Known test-transaction description supplied with the category mapping', true),
  ('afb095a6-f3c7-5c92-ad38-cd8eb083e7d3', null, 'trxDEIBAN', 'trxdeiban', array['original', 'display']::text[], 'contains', 'Known test-transaction description supplied with the category mapping', true),
  ('43978e89-8287-5757-bf44-0d95993ef068', null, 'trxDEIBAN11', 'trxdeiban11', array['original', 'display']::text[], 'contains', 'Known test-transaction description supplied with the category mapping', true)
on conflict (id) do update set
    pattern = excluded.pattern, normalized_pattern = excluded.normalized_pattern,
    match_fields = excluded.match_fields, match_method = excluded.match_method,
    reason = excluded.reason, active = excluded.active, updated_at = now()
where (public.exclusion_rules.pattern, public.exclusion_rules.normalized_pattern,
       public.exclusion_rules.match_fields, public.exclusion_rules.match_method,
       public.exclusion_rules.reason, public.exclusion_rules.active)
  is distinct from (excluded.pattern, excluded.normalized_pattern, excluded.match_fields,
                   excluded.match_method, excluded.reason, excluded.active);

insert into public.category_assignments (user_id, transaction_id, category_id, assignment_source)
select t.user_id, t.id, c.id, 'manual'
  from public.transactions t
  join public.categories c on lower(c.name) = lower(t.category) and c.user_id is null
 where t.category is not null
   and not exists (select 1 from public.category_assignments a
                    where a.transaction_id = t.id and a.is_active and a.is_primary)
on conflict (transaction_id) where is_active and is_primary do nothing;

commit;

