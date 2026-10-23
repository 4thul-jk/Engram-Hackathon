# Engram Hackathon - Memory retrieval and proactive triggers

This repository contains the memory retrieval and trigger component of Engram, an experimental external memory assistant. It is a standalone backend that the team can connect to its Gemini processing and conversational layer.

## Start the local demo

Requires Node.js 20.18 or later. No API keys are needed for the in-memory demonstration.

```sh
cd engram-retrieval
npm start
```

Open http://127.0.0.1:4317, enter `local-admin-change-me`, connect, then add fictional demo records. The demo retrieves source-linked memories, creates an automatic visit reminder after 15 seconds, and supports an explicit desk check-in for a context-triggered prompt. Quiet hours and cooldown remain active.

## Included

- MongoDB Atlas text and vector retrieval adapters, application-side hybrid rank fusion, Automated Embedding configuration and optional Voyage reranking.
- Exact person and upcoming-plan queries with household/subject access boundaries.
- Server-side scheduled and context-triggered prompts with cancellation, expiry, deduplication, quiet hours, cooldown and snooze.
- Team-facing `POST /episodes`, `POST /episodes/review`, and `POST /retrieve` endpoints using `patient_id`.
- Original-source references, caregiver review, idempotent ingestion and a citation-integrity helper for the team's Gemini backend.
- Atlas index setup and a Stream Processing pipeline template.
- Experimental stability updates, idempotent practice logs and daily rehearsal lists capped at three memories.
- A developer dashboard, synthetic fixtures and automated tests.

## Test

```sh
cd engram-retrieval
npm test
# With the service running in a separate terminal:
npm run demo:contract
```

The latest local verification passed **59 tests**. The contract demo checks ingestion, draft exclusion, caregiver approval, retrieval, and duplicate prevention. `npm run demo:memory` exercises the experimental practice loop against a fresh running local server.

## Connect the team

- [Build timeline and verified commit times](docs/PROJECT-HISTORY.md)
- [Live Atlas verification results](docs/LIVE-ATLAS-VERIFICATION.md)
- [How ingestion, retrieval, triggers and practice work](docs/PROCESS.md)
- [Backtracking and recovery runbook](docs/BACKTRACKING.md)
- [Complete setup, configuration and existing trigger APIs](engram-retrieval/README.md)
- [Team API contract and example JSON](engram-retrieval/TEAM-HANDOFF.md)
- [Native Atlas retrieval setup](engram-retrieval/NATIVE-ATLAS.md)
- [Memory model and daily practice handoff](engram-retrieval/MEMORY-MODEL.md)
- [Gemini backend integration example](engram-retrieval/examples/team-backend.js)
- [Atlas Stream Processing template](engram-retrieval/atlas/context-pipeline.json)

Copy `engram-retrieval/.env.example` to `.env` inside that folder to configure Atlas. Replace the demonstration tokens before exposing the service. Run `npm install` for the MongoDB driver, then follow the component README to create indexes and provision optional features.

## Current boundaries

Local mode is **in memory**, resets on restart, and uses **keyword matching only**. Live Atlas text/vector search, native rank fusion and Automated Embedding were verified against MongoDB 8.0.34 with fictional records; see the linked verification report. Native reranking, external Voyage API reranking and Stream Processing remain unverified. Automated Embedding is generally available on Atlas (MongoDB announcement: 12 August 2026); self-managed availability differs. Native reranking has separate version, enablement and release-status requirements.

This component does not implement Gemini media encoding, WhatsApp, medication decisions, emergency monitoring, continuous recording, the full caregiver console, or a clinically validated memory model. The supplied dashboard is a developer test interface. Data and event examples are fictional. Citation integrity is not proof that a generated claim is factually supported.

