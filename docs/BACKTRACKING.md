# Backtracking, testing and recovery runbook

Run Git commands from the repository root (`Engram-Hackathon`), and npm commands from `engram-retrieval`. Keep the tracked checkout as your source of truth. Do not work from the earlier upload ZIP expecting later changes.

## 1. Identify the exact version before changing anything

```powershell
git status --short
git rev-parse HEAD
git log --oneline --decorate -12
git log --date=iso-strict --format="%h %aI %cI %s"
```

Or from the component:

```powershell
npm run project:history
npm run project:history -- --json
```

Record author and committer timestamps separately when they differ. They are editable Git metadata, not independent proof of source creation time. The history report converts times using `Asia/Kolkata` and `Europe/London`, rather than a fixed London offset.

## 2. Find the change that introduced a behavior

```powershell
git show --stat 415b59d
git show 415b59d -- engram-retrieval/src/search.js
git diff e765601..415b59d -- engram-retrieval/src/service.js
git log -p -- engram-retrieval/src/rehearsal.js
git blame engram-retrieval/src/search.js
```

Use [PROJECT-HISTORY.md](PROJECT-HISTORY.md) to choose a checkpoint, and [PROCESS.md](PROCESS.md) to map the failing step to its route, collection and file. `git blame` identifies the last commit touching a line, not necessarily the original author of an idea.

## 3. Export a checkpoint without changing your working tree

```powershell
git archive --format=zip --output=../engram-baseline-e765601.zip e765601
```

Extract the ZIP to a **new** directory and use `STORE=memory` when testing old code. A Git archive excludes ignored `.env`, dependencies and runtime data. It is a code snapshot, not a database backup.

If you prefer a local inspection branch, first ensure `git status --short` is clean, then:

```powershell
git switch -c codex/inspect-baseline e765601
# Inspect/test without pushing this branch over main.
git switch main
```

Save uncommitted work intentionally before switching. Do not use force push or destructive reset merely to inspect an old version.

## 4. Reproduce using the smallest relevant test

From `engram-retrieval`:

| Area | Focused command | Expected evidence |
|---|---|---|
| Retrieval and reminder behavior | `node --test test/service.test.js` | Scope, source, cancellation, job and prompt tests |
| Team ingestion/retrieval | `node --test test/team-contract.test.js` | Draft exclusion, approval, metadata and retry behavior |
| Practice scheduling | `node --test test/memory.test.js` | Formula branches, cap, skip, idempotency and DST |
| Native search construction | `node --test test/native-search.test.js` | Valid branch shape and explicit fallbacks; mocked provider |
| Entire component | `npm test` | Latest recorded suite: 59 passing tests |

For actual HTTP workflows, run `npm start` in one terminal, then use the same directory in another:

```powershell
npm run demo:contract
```

The contract demo creates a fictional episode, checks draft exclusion, approves it, retrieves it and retries ingestion. To test practice against a **fresh local memory process**:

```powershell
npm run demo:memory
npm run memory:nightly
```

The memory demo consumes a daily practice slot. Re-running on the same data can correctly return a conflict. Restarting local mode clears all data; do not treat that as a production cleanup method. A live Atlas demo persists records and needs deliberate test-data management.

## 5. Triage common failures

| Symptom | Check | Likely next action |
|---|---|---|
| 401 | Which service token is being sent? | Fix backend token wiring; never print the token in public logs |
| 403 | Caregiver vs companion route; configured subject; origin | Correct identity/scope/origin; do not disable checks |
| Draft missing in search | Review status and source IDs | Approve through trusted caregiver flow if appropriate |
| No prompt after seed | Mode, worker, quiet hours, cooldown, due/expiry times | Read `/admin/activity`; London timezone can differ from device timezone |
| Cancelled prompt remains on screen | Canonical plan state and frontend polling/rendering | Refresh eligible prompts; stale browser UI is not current authorization |
| Snoozed prompt doesn't return | Expiry/context freshness | It may correctly expire before the snooze ends |
| Context produces nothing | Event age, place match, eligible intention, stream mode | A stale event or missing Atlas processor should not fabricate a prompt |
| Practice list empty | Confidence >= 0.8, sources, approval, due day, existing snapshot | Do not generate before data is ready; immutable empty set is intentional |
| Attempt returns 409 | Same ID with changed content, consumed slot, revoked approval | Inspect record/slot; do not bypass daily cap with new IDs |
| Native stage fails | Actual server version/model, project enablement and index readiness | Run `npm run atlas:check`; inspect reported fallback |
| Search warning with results | `featuresUsed` and `retrievalComplete` | Distinguish optional reranker failure from incomplete retrieval |
| Loopback tests fail with EACCES | Local execution/sandbox networking | Run the suite in a normal authorized terminal; no code workaround needed |

## 6. Inspect a runtime incident

Use caregiver-authenticated `GET /admin/activity?subjectId=<configured subject>` for recent jobs, prompts and audit events. In the developer UI this is the Activity section.

Follow IDs in order:

```text
episode -> original source -> review status -> recall audit
plan -> prompt_job -> prompt -> response / audit
context_event -> assistance_candidate -> job -> prompt
rehearsal_set -> recall_attempt -> practice_slot -> memory_state
```

For Atlas use the collections in Compass/Atlas with the same household/subject filters. Practice logs are not included in `/admin/activity`; inspect their dedicated collections or memory/practice APIs. Do not expose real patient data when sharing debug output.

Local mode keeps records only in the running process. If it was restarted, historical activity cannot be recovered from Git. Atlas database data, external model calls, media and push/messaging state are not versioned by these commits.

## 7. Roll back behavior without losing history

First consider a configuration fallback: `HYBRID_BACKEND=application` disables native hybrid attempts; `NATIVE_RERANK=false` disables optional native reranking. Restart the service after private configuration changes.

For a code regression, identify the offending commit, save current work, and create a new inverse commit with `git revert <commit-sha>`. Review conflicts, run relevant tests and the full suite, update the ledger, then push normally. Do not blindly revert all later commits or force-push over teammates' changes.

**Code rollback is not data rollback.** Before using older code against Atlas, review schema/config compatibility and take an appropriate database backup. This repository has no automatic database migration rollback, media recovery or backup tool. Prefer a separate fictional test database for historical experiments.

## 8. Maintain the trail

For each future checkpoint record: commit, timezone-aware timestamp, purpose, changed contracts/collections, commands run, actual result, provider mode, limitations and a known-good checkpoint. Keep externally run live-test evidence separately with a timestamp and sanitized IDs. Update the history ledger before committing; regenerate the Git report afterward to capture the resulting SHA and time.
