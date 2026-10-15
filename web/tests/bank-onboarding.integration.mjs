import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

// Opt-in test: requires Docker running, free ports 3001/55431/55432/55430,
// and no other Next.js dev process using this checkout's dev output.
const repo = fileURLToPath(new URL('../..', import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), 'fse-bank-onboarding-'));
const project = `fse-bank-onboarding-${process.pid}`;
const container = `supabase_db_${project}`;
mkdirSync(join(workdir, 'supabase', 'seeds'), { recursive: true });
cpSync(join(repo, 'supabase', 'migrations'), join(workdir, 'supabase', 'migrations'), { recursive: true });
cpSync(join(repo, 'supabase', 'seed.sql'), join(workdir, 'supabase', 'seed.sql'));
cpSync(join(repo, 'supabase', 'seeds', 'transaction-categories.sql'), join(workdir, 'supabase', 'seeds', 'transaction-categories.sql'));
writeFileSync(join(workdir, 'supabase', 'config.toml'), `
project_id = "${project}"
[api]
port = 55431
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55432
shadow_port = 55430
major_version = 15
[db.seed]
sql_paths = ["./seed.sql", "./seeds/transaction-categories.sql"]
[studio]
enabled = false
[inbucket]
enabled = false
[auth]
site_url = "http://localhost:3000"
[auth.email]
enable_signup = true
enable_confirmations = false
`);
const require = createRequire(`${repo}/web/package.json`);
const { createServerClient } = require('@supabase/ssr');
const cli = (...args) => execFileSync('npx', ['--yes','supabase@latest','--workdir',workdir,'--agent','no',...args], { encoding:'utf8', stdio:['pipe','pipe','pipe'], maxBuffer:50*1024*1024 });
const sql = (text) => execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], { input:text, encoding:'utf8', stdio:['pipe','pipe','pipe'] }).trim();
const user = '00000000-0000-4000-8000-000000000001';
let app;
let passed = 0;
const cookies = new Map();
const origin = 'http://127.0.0.1:3001';
async function request(path, init = {}, authenticated = true) {
  return fetch(`${origin}${path}`, { redirect:'manual', ...init,
    headers:{ ...(authenticated ? {Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')}:{}), ...init.headers } });
}
async function redirect(path, target, authenticated = true) {
  const response = await request(path, {}, authenticated);
  assert.equal(response.status,307,`Expected redirect for ${path}`);
  assert.equal(new URL(response.headers.get('location'),origin).pathname,target,`Wrong redirect for ${path}`);
  passed++;
}
async function html(path) {
  const response = await request(path);
  assert.equal(response.status,200,`Expected page ${path}`);
  return response.text();
}
function navigation(markup) {
  const match = markup.match(/<nav\b[^>]*aria-label="Dashboard navigation"[\s\S]*?<\/nav>/);
  assert.ok(match,'Shared navigation is missing');
  return match[0];
}
function noFinancial(markup) {
  const nav = navigation(markup);
  assert.ok(!nav.includes('href="/dashboard"'),'Overview should be hidden');
  assert.ok(!nav.includes('href="/dashboard/transactions"'),'Transactions should be hidden');
  assert.ok(nav.includes('href="/dashboard/profile"'),'Profile must stay reachable');
  assert.ok(nav.includes('href="/dashboard/bank"'),'Bank menu link must exist');
}
const connection = (fields) => sql(`update public.connections set ${fields} where user_id='${user}' and provider='tink';`);
try {
  console.log('Starting disposable local Supabase and HTTP app; no hosted database or Tink API is used.');
  cli('start','--exclude','studio,realtime,storage-api,imgproxy,mailpit,logflare,vector,edge-runtime,postgres-meta,supavisor');
  const status = JSON.parse(cli('status','--output','json'));
  const api = status.API_URL ?? status.api_url;
  const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? status.anon_key;
  assert.equal(api,'http://127.0.0.1:55431');
  assert.ok(key);
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL:api, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,
    DATABASE_URL:'',DATABASE_CA_CERT:'',TINK_CLIENT_ID:'',TINK_CLIENT_SECRET:'',TINK_REDIRECT_URI:'',TINK_TEST_MODE:'true' };
  app = spawn('npm',['run','dev','--','--hostname','127.0.0.1','--port','3001'], {cwd:`${repo}/web`,env,stdio:['ignore','pipe','pipe'],detached:true});
  // Do not expose CLI or application output, cookies, keys or session tokens.
  app.stdout.on('data',()=>{}); app.stderr.on('data',()=>{});
  for(let attempt=0;attempt<100;attempt++) {
    try { if((await request('/login',{},false)).status === 200) break; } catch {}
    if(attempt===99) throw new Error('Temporary app did not start');
    await pause(300);
  }
  const auth = createServerClient(api,key,{cookies:{
    getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value)),
  }});
  const login = await auth.auth.signInWithPassword({email:'demo@example.com',password:'demo-planner-2026'});
  assert.equal(login.error,null,'Synthetic local login failed');
  const originalCount = Number(sql('select count(*) from public.transactions;'));
  const originalCookies = new Map(cookies);
  cookies.clear();
  const newAuth = createServerClient(api,key,{cookies:{
    getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value)),
  }});
  const registered = await newAuth.auth.signUp({email:'onboarding-test@example.com',password:'synthetic-local-test-only',options:{data:{first_name:'Test',last_name:'Student'}}});
  assert.equal(registered.error,null,'Local registration failed');
  const registeredId = registered.data.user?.id;
  assert.match(registeredId ?? '',/^[0-9a-f-]{36}$/);
  assert.equal(sql(`select first_name || '|' || last_name from public.profiles where id='${registeredId}';`),'Test|Student'); passed++;
  await redirect('/dashboard/bank','/dashboard/profile');
  await redirect('/dashboard','/dashboard/profile');
  sql(`update public.profiles set username='onboarding_test' where id='${registeredId}';`);
  await redirect('/dashboard','/dashboard/bank');
  noFinancial(await html('/dashboard/bank')); passed++;
  cookies.clear(); originalCookies.forEach((value,name)=>cookies.set(name,value));

  await redirect('/dashboard','/login',false);
  await redirect('/dashboard/bank','/login',false);
  await redirect('/dashboard','/dashboard/bank');
  await redirect('/dashboard/transactions','/dashboard/bank');
  await redirect('/login','/dashboard/bank');
  await redirect('/register','/dashboard/bank');
  const setup = await html('/dashboard/bank');
  assert.ok(setup.includes('Add your bank') && setup.includes('Add bank now'));
  assert.ok(setup.includes('not configured in this environment'));
  noFinancial(setup); passed++;
  for(const path of ['/api/transactions/export','/api/transactions/00000000-0000-4000-8000-000000000005']) {
    const response = await request(path, path.endsWith('export') ? {} : { method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({categoryId:null}) });
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,'BANK_SETUP_REQUIRED'); passed++;
  }
  noFinancial(await html('/dashboard/profile')); passed++;

  connection("live_sync_enabled=true,last_synced=null,status='ERROR',sync_complete=false");
  await redirect('/dashboard','/dashboard/bank');
  const initial = await html('/dashboard/bank');
  assert.ok(initial.includes('Let’s load your bank data') || initial.includes('Let&#x27;s load your bank data') || initial.includes('load your bank data'));
  assert.ok(initial.includes('Retry import')); noFinancial(initial); passed++;

  connection("last_synced=now(),status='ACTIVE',sync_complete=true");
  const dashboard = await html('/dashboard');
  assert.ok(navigation(dashboard).includes('href="/dashboard/transactions"'));
  assert.ok(!dashboard.includes('Add bank now') && !dashboard.includes('aria-label="Bank connection"'));
  assert.ok(dashboard.includes('Manage bank')); passed++;
  const transactions = await html('/dashboard/transactions');
  assert.ok(navigation(transactions).includes('aria-current="page"')); passed++;
  const manage = await html('/dashboard/bank');
  assert.ok(manage.includes('Manage your bank') && manage.includes('Refresh data')); passed++;
  const exported = await request('/api/transactions/export');
  assert.equal(exported.status,200); assert.ok(exported.headers.get('content-type').includes('text/csv')); passed++;

  // A bank-read failure must never look like a deleted or unconfigured bank.
  // Change permissions only in this disposable local project, then restore them.
  sql('revoke select on public.connections from authenticated;');
  await redirect('/dashboard','/dashboard/bank');
  const unavailable = await html('/dashboard/bank');
  assert.ok(unavailable.includes('Bank connection unavailable'));
  assert.ok(!unavailable.includes('Add bank now')); passed++;
  const unavailableApi = await request('/api/transactions/export');
  assert.equal(unavailableApi.status,503);
  assert.equal((await unavailableApi.json()).code,'BANK_UNAVAILABLE'); passed++;
  sql('grant select on public.connections to authenticated;');

  connection("status='EXPIRED'");
  assert.ok((await html('/dashboard/bank')).includes('Reconnect bank'));
  assert.ok((await html('/dashboard')).includes('Renew bank connection')); passed++;
  connection("status='ERROR'");
  assert.ok((await html('/dashboard')).includes('Financial overview'));
  assert.ok((await html('/dashboard/bank')).includes('Refresh data')); passed++;

  sql(`update public.profiles set username=null where id='${user}';`);
  await redirect('/dashboard','/dashboard/profile');
  await redirect('/dashboard/bank','/dashboard/profile');
  assert.ok((await html('/dashboard/profile')).includes('Please enter your username')); passed++;
  sql(`update public.profiles set username='demo_student' where id='${user}';`);
  connection('live_sync_enabled=false');
  await redirect('/dashboard','/dashboard/bank');
  sql(`update public.user_roles set status='suspended' where user_id='${user}';`);
  await redirect('/dashboard/bank','/account-unavailable');
  sql(`update public.user_roles set status='active',role='admin' where user_id='${user}';`);
  const adminProfile = await html('/dashboard/profile');
  noFinancial(adminProfile); assert.ok(navigation(adminProfile).includes('href="/dashboard/admin"')); passed++;
  const admin = await html('/dashboard/admin');
  noFinancial(admin); assert.ok(admin.includes('User management')); passed++;
  const callback = await request('/api/tink?error=USER_CANCELLED');
  assert.equal(callback.status,307); assert.equal(new URL(callback.headers.get('location'),origin).pathname,'/dashboard/bank'); passed++;

  assert.equal(Number(sql('select count(*) from public.transactions;')),originalCount,'Fixture transactions must stay unchanged');
  console.log(`PASS: ${passed} authenticated HTTP checks against real local Auth/RLS and Next.js routes. Fixture transaction count unchanged.`);
} catch(error) {
  console.error('Local onboarding HTTP test failed:',error instanceof assert.AssertionError ? error.message : error.name ?? 'Error');
  process.exitCode = 1;
} finally {
  if(app?.pid) {
    try { process.kill(-app.pid,'SIGTERM'); await Promise.race([once(app,'exit'),pause(3000)]); } catch {}
  }
  try { cli('stop','--no-backup'); console.log('Disposable local test stack stopped and test data discarded.'); }
  catch { console.log('Temporary stack cleanup needs checking.'); process.exitCode=1; }
}
