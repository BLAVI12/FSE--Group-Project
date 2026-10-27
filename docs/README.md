# Documentation

Where the project documentation is. The list follows section 9 of the course
checklist ("Project documentation"). Most topics live next to the code they
describe, so they stay true when the code changes; this page links to them
instead of repeating them.

| Topic | Where |
|---|---|
| Project objective and finance use case | [Root README](../README.md) (summary); final project report |
| How to evaluate (live site, demo login) | [Root README: how to evaluate](../README.md#how-to-evaluate) |
| Implemented features and their user stories | [user-stories.md](user-stories.md) |
| Acceptance criteria | [user-stories.md](user-stories.md), under each user story |
| Changed or dropped features | [user-stories.md](user-stories.md#changed-or-dropped-features) |
| Architecture and technology stack | [Root README: project structure](../README.md#project-structure), [web/README.md](../web/README.md) |
| Data model and database | [fintech-erm.md](fintech-erm.md) (entity-relationship diagram), [supabase/README.md](../supabase/README.md), the migrations in [`supabase/migrations/`](../supabase/migrations) |
| External API integration (Tink), including failure handling | [external-api.md](external-api.md) |
| Testing and quality strategy | [Root README: checks](../README.md#checks), [web/README.md: checks](../web/README.md#checks), the CI workflow [`.github/workflows/node.js.yml`](../.github/workflows/node.js.yml) |
| Security | [Root README: remaining security limitations](../README.md#remaining-security-limitations); [supabase/README.md: who can do what](../supabase/README.md#who-can-do-what) (row-level security, roles); [user story 11](user-stories.md#user-story-11-only-i-can-see-my-data); [external-api.md](external-api.md) (secrets and tokens stay on the server) |
| Git and development workflow | [AGENTS.md](../AGENTS.md) (branches, reviews, secrets, data rules), the [pull request template](../.github/pull_request_template.md) |
| CI/CD pipeline | [`.github/workflows/node.js.yml`](../.github/workflows/node.js.yml); deployment through Vercel's GitHub integration |
| Deployment | [web/README.md: deploying on Vercel](../web/README.md#deploying-on-vercel), [supabase/README.md: hosted project](../supabase/README.md#hosted-project) |
| AI coding agents | [Root README: AI coding agents](../README.md#ai-coding-agents) (versioned configuration, data, quality bar); [AGENTS.md](../AGENTS.md) (the rules every agent follows); the "AI use" section of every pull request; examples in the final project report |
| Important engineering decisions | [decisions.md](decisions.md) (bank connection and bank data) |
| Known limitations | [Root README: known limitations](../README.md#known-limitations) |
| Reflection | Final project report |
