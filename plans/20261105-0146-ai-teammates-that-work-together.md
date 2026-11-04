# AI teammates that work with people and with each other

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template. It is a design plan: it was written against `upstream/main` at `e34fb4e259` (desktop 2.0.4) and must be re-checked against the tree it is implemented on.


## Purpose / Big Picture

Today a Paradev Dev (an AI teammate that people create, name, and talk to in channels and DMs) only ever works for one person at a time and only ever starts when a person writes to it. Two Devs cannot hand work to each other, and nobody can see at a glance what every Dev and every person in the organization is doing right now.

After this plan, a person in the desktop app opens a "Right now" page and sees every teammate, human or AI, with one line each: "Scout: checking the import list with Ledger", "Ledger: comparing Scout's list against the numbers", "Bash: writing the 9am brief", "Maya: active". A Dev can ask another Dev for help in the middle of its work, the exchange is visible as messages in the thread where the person's request lives, and the person can stop it. Each Dev shows which engine it runs on (Paradev's own agent, Claude Code, or Codex), and a Dev can be created to run on Claude Code. A later milestone draws this as an office with rooms and desks.

The order of milestones is deliberate: visibility first, then Dev-to-Dev asks with hard limits, then engines, then the office picture. Nothing lets agents wake each other before the team can watch them do it.


## Assumptions

- The `channels` feature flag (`FEATURE_FLAGS.CHANNELS` in `packages/shared/src/constants.ts`) stays the gate for Devs and channels; everything here ships behind it. There are no production Dev users yet, so schema additions need no backfill.
- The ACP adapter for Claude Code (`@agentclientprotocol/claude-agent-acp`, pinned in `packages/host-service/src/chat-v3/acpCatalogue.ts`) accepts `mcpServers` entries with an HTTP URL and custom headers in `session/new`. Spike 0 confirms or refutes this.
- Codex's ACP adapter behaves the same for MCP servers, but Codex chat on cloud boxes is not enabled (`supportsCloudAgentChat` in `packages/shared/src/cloud-agent-launch.ts` lists only `claude` and `pdev`). Codex therefore comes after Claude Code.
- The organization pays for Dev-to-Dev work, attributed to the person whose message started the chain, exactly as task work is attributed today.


## Open Questions

- Should Dev-to-Dev asks be on by default for an organization, or an org setting an admin turns on? Impacts Milestone 2 Plan of Work and Validation. Decision Log placeholder D7.
- When a Dev runs on Claude Code, who pays for tokens: Paradev's gateway (as pdev main sessions do today) or the box's own model credential (`turn-host.ts` `modelHeaders`)? Impacts Milestone 3. Placeholder D8.
- Do people want their own "what I'm doing" line on the board, or is presence (active/away) enough for humans in the first version? Impacts Milestone 1. Placeholder D9.


## Progress

- [x] (2026-11-05 01:46Z) Research: product survey, protocol survey, harness code map, prior Fable design review. Findings folded into Context and Decision Log.
- [ ] Spike 0: Claude Code ACP adapter driven by the worker with Dev tools over `mcpServers`.
- [ ] Milestone 1: Right now board and Dev status line.
- [ ] Milestone 2: `ask_dev` hand-offs with chain limits.
- [ ] Milestone 3: Engine per Dev (Claude Code first, task sessions first).
- [ ] Milestone 4: Office view.


## Surprises & Discoveries

- Observation: "Devs never wake each other" is not only a loop guard. Every turn carries `actingUserId`, the person the Dev works for; `turnCredentials` throws without it (`packages/trpc/src/router/agent/agent-worker.ts`), channel access for a Dev turn is the intersection of the Dev's membership and that person's access (`packages/trpc/src/router/channel/access.ts`), and a task report is dropped if the requester's account is gone (`packages/trpc/src/router/agent/tasks.ts` `reportToParent`).
  Evidence: `packages/trpc/src/principal.ts` documents `askerId` as "Always set: no person, no work".
- Observation: the team already saw a runaway in testing: a hidden `start_task` failure made a main session start six tasks in a row.
  Evidence: commit `19a2af0c70`, "fix(devs): start_task reports a launch failure".
- Observation: Dev tools are served over MCP at `/mcp/agent` (not through ACP) because pdev ignores ACP `mcpServers`. Other ACP agents do honour `mcpServers`, so the same tools can reach them with no new transport.
  Evidence: `plans/20261028-0930-devs-main-session-and-tasks.md`, `apps/api/src/app/mcp/agent/route.ts`.
- Observation: the closest shipped products bound delegation with small numbers: Dust refuses sub-agent calls past depth 4; Claude Code agent teams drop identical repeated messages, rate-limit per sender and cap the queue at 50 so "a message loop between two sessions stops on its own"; Devin gives each child session its own compute limit; Grok Bot has no cap and warns that "parallel handoffs create duplicate work".
  Evidence: docs.dust.tt/docs/run-agent; code.claude.com/docs/en/agent-teams; docs.devin.ai; docs.x.ai/grok-bot/chat-and-collaboration.
- Observation: DeepWiki's index of this repo has no page on the agent worker or Devs and conflates Devs with the Slack agent; it is not a source for this area.


## Decision Log

- Decision D1: Dev-to-Dev communication is a structured tool (`ask_dev`) delivered into the target Dev's main session, not a channel message that starts turns.
  Rationale: a tool call carries `askerId` for free, so the human root, access intersection and cost attribution are unchanged. A channel post would need a Dev-only principal and a second access model, and the Jev router (`packages/trpc/src/router/agent/channel-routing.ts`) would fan Dev chatter out to every Dev in the room. Dust, OpenAI Agents SDK and Devin all model hand-off as a tool or child session for the same reason. The `principal.kind === "person"` gate in `sendChannelMessage` stays as is.
  Date/Author: 2026-11-05, Fable (research) with Opus design review.
- Decision D2: Every hand-off is a row in a new `agent_handoffs` table with an A2A-style state (`submitted`, `working`, `input_required`, `completed`, `failed`, `canceled`) and a `rootTurnId`.
  Rationale: the Right now board, the thread mirror messages and the loop guards all read one record instead of reconstructing chains from turns. A2A's task states are the common vocabulary of the protocols surveyed; we borrow the words, not the wire format.
  Date/Author: 2026-11-05, Fable.
- Decision D3: Hard limits ship in the same PR as `ask_dev`: depth at most 2 from the person, no Dev twice in one chain, at most 3 asks per turn, identical ask text to the same Dev deduped within a chain, a daily per-organization cost cap on hand-off turns, and a paused Dev refuses asks.
  Rationale: the observed six-task runaway, plus unbounded model retries in the worker, mean two Devs can retry at each other forever. Shipping guards later is how loops happen.
  Date/Author: 2026-11-05, Fable.
- Decision D4: A message from another Dev is never consent and never a person's instruction. The receiving Dev sees it wrapped as "a request from teammate Scout, working for Maya", with the same reply target rules as a thread reply.
  Rationale: Claude Code agent teams and Grok Bot both keep approvals with the human who owns the session. Our worker auto-allows permissions, so the only approval surface is the prompt wrapper and the person's "stop" in the thread.
  Date/Author: 2026-11-05, Fable.
- Decision D5: Claude Code and Codex become teammates only as the engine of a Dev, never as terminal agents added to channels.
  Rationale: terminal agents started by `superset agents create` have no actor row, no turn token, no `agent_turns`; the orchestrate skill says its completion envelopes are "a prompt convention visible in terminal snapshots, not durable Paradev events". A Dev keeps identity, permissions, cost and activity; only the process changes.
  Date/Author: 2026-11-05, Fable with Opus review.
- Decision D6: Non-pdev engines run inside the existing Temporal workflow as a second activity, not as a bypass through `launchAgentSession`.
  Rationale: the worker gives retries, steers, settle, the realtime session store and `agent_turns` cost rows. A box-launched session through host-service `sessions.create` loses all of that and has no turn token on the box. Claude Code cannot use pdev's cloud mode (it needs files local), so task sessions on Claude run on the box, driven by a worker activity that talks to host-service `sessions.*`, while main sessions on Claude run the ACP adapter in the worker container.
  Date/Author: 2026-11-05, Fable.
- D7: open (asks on by default vs org setting).
- D8: open (who pays for Claude Code tokens).
- D9: open (human status line).


## Outcomes & Retrospective

To be written at each milestone.


## Context and Orientation

Apps and packages touched: `packages/db` (schema and migrations), `packages/trpc` (API procedures under `src/router/agent` and `src/router/channel`), `apps/api` (the MCP tools endpoint `src/app/mcp/agent/route.ts`), `apps/agent-worker` (the cloud process that runs Dev turns), `apps/realtime` (push to desktop clients), `apps/desktop` (renderer routes under `src/renderer/routes/_authenticated/_dashboard/`), `packages/shared` (flags, channel event types). No desktop IPC channels change; the desktop talks to the API over tRPC.

Terms, in plain words:

A **Dev** is an AI teammate: a row in `agents` (`packages/db/src/schema/agents.ts`) with a name, avatar, instructions and memories, and an **actor** row shared with people so it can be a channel member, author and mention target. A **channel** is an in-app Slack-style room (`packages/trpc/src/router/channel/`). A **session** is one conversation a Dev holds (`agent_sessions`): a Dev has one **main session** that receives every DM, mention and thread reply, and **task sessions** (role `writer` or `reviewer`) it starts on cloud machines ("boxes") to read or change code. A **turn** is one run of the model in a session (`agent_turns`), with a reason (`direct_message`, `mention`, `thread_reply`, `channel_message`, `task_start`, `task_update`, `routine`), a status, token counts and cost. A **steer** is a message that joins a running turn instead of starting a new one. The **asker** (`actingUserId`, `DevPrincipal.askerId`) is the person every turn works for.

The **worker** (`apps/agent-worker`) runs one Temporal workflow per session (`src/workflows/agentSession/agentSession.ts`): it starts a turn, spawns `pdev acp` (Paradev's own coding agent speaking ACP, the Agent Client Protocol, a JSON-RPC protocol between an editor-like client and an agent), feeds it the prompt and steers, mirrors its transcript into the realtime session store, and settles the turn through `agentWorker.settleTurn`. `apps/agent-worker/src/activities/createActivities/createActivities.ts` is where pdev is configured: a fresh home directory per attempt, `settings.json`, `APPEND_SYSTEM.md` with the role prompt (`systemFor`, around line 545), and `mcp.json` pointing at the Dev tools.

**Dev tools** are the actions a main session may take: `reply`, `list_work`, `read_task`, `start_task`, `message_task`, `stop_task`, `remember`, `recall`, `list_environments`, `read_channel`, `channel_tasks`, routines and pages. They are tRPC procedures in `packages/trpc/src/router/agent/dev-tools.ts`, `dev-channel-tools.ts`, `dev-routine-tools.ts`, served to the model as an MCP server (Model Context Protocol, a tool-calling protocol) at `apps/api/src/app/mcp/agent/route.ts`, authenticated by a 15-minute HMAC **turn token** (`packages/trpc/src/lib/agent-turn/turn-token.ts`) that the worker refreshes every 4 minutes into a headers file. Task sessions get no Dev tools; they report back through `afterTaskTurn` and `reportToParent` in `packages/trpc/src/router/agent/tasks.ts`, which steers the parent's main session with `promptId = task-update:<turnId>` so a retry never delivers twice.

**Live state** today: `agent.get` returns `working: { reason }` for a running turn (`packages/trpc/src/router/agent/agent.ts`); `agents.changed` is published to every member of the organization on turn start, queue and settle (`packages/trpc/src/router/agent/agents-changed.ts`, `packages/shared/src/channels.ts`), carrying only the `agentId`; the desktop refetches `agent.get`, `agent.list` and `agent.activity` on it (`ChannelsRealtime.tsx`). Tool-call-level detail lives in a per-session durable object in `apps/realtime/src/agent-session-hub.ts`, readable with a per-session ticket from `agent.sessionStream`. People have only active/away presence (`packages/shared/src/org-presence.ts`).

The gate this plan works around but keeps: `sendChannelMessage` in `packages/trpc/src/router/channel/channel-message.ts` calls `startTurnsForMessage` only when `principal.kind === "person"`, with the comment "Only a person's message starts Devs' work, so Devs never wake each other." Slack bot posts are dropped the same way in `apps/api/src/app/api/integrations/slack/events/route.ts`.

Other engines: host-service already drives Claude Code, Codex, Gemini, OpenCode, pi and pdev over ACP (`packages/host-service/src/chat-v3/acpCatalogue.ts`) and exposes `sessions.create/list/get/read/send/close/resume` (`packages/host-service/src/trpc/router/sessions/sessions.ts`). Cloud boxes install `claude`, `codex` and `pdev` (`packages/sandbox/bundle/steps.json`). Automations launch a chat on a box through `launchAgentSession` in `packages/trpc/src/router/automation/hostSession.ts`.


## Plan of Work

### Spike 0: Claude Code as a worker-driven ACP agent with Dev tools (time box: one day)

Goal: prove the Claude Code ACP adapter can be spawned by the worker the way pdev is, receive the Dev tools as an MCP server passed in `session/new` `mcpServers` with an `x-agent-turn-token` header, call `reply`, and be resumed after a simulated worker restart.

Approach: in a scratch branch, add an environment switch to `createActivities.ts` that replaces the `pdev acp` argv with the `claude-agent-acp` adapter binary, passes `mcpServers: [{ type: "http", url: <API>/mcp/agent, headers: { "x-agent-turn-token": token } }]` in `session/new`, sets the adapter's permission mode to the catalogue's `bypassPermissions`, and resumes with `session/load` by the adapter's session id instead of restoring pdev's JSONL file. Record how token refresh can work: the adapter reads headers once at `session/new`, so either (a) a tiny local HTTP forwarder in the worker container that injects the current token, or (b) a longer-lived token for non-pdev engines. Measure the adapter's idle signal timing against the worker's 200 ms main-session settle grace.

Success criteria: a main-session turn completes end to end with a `reply` tool call recorded in `agent_turns.toolCalls`, OR a documented blocker with the adapter version and error. Outcome goes to Surprises & Discoveries and decides whether Milestone 3 runs main sessions in the worker (plan) or only task sessions on boxes (fallback).

### Milestone 1: Right now board and Dev status line

What exists at the end: a "Right now" page in the desktop sidebar (behind the `channels` flag) listing every Dev and person in the organization, grouped by the channels they share with the viewer, each with an avatar, an engine badge, and one status line that updates live.

Schema: add `status_line text` and `status_line_updated_at timestamptz` to `agent_sessions` in `packages/db/src/schema/agents.ts`. Generate the migration with the `db-migrations` skill (`.agents/skills/db-migrations/SKILL.md`); never hand-edit `packages/db/drizzle/`.

Dev tool: add `setStatus` to `packages/trpc/src/router/agent/dev-tools.ts` as a `devProcedure` taking `{ text: string }` of at most 120 characters that writes the status line on `ctx.principal.sessionId`, and register it as `set_status` in `apps/api/src/app/mcp/agent/route.ts`. Clear the line in `settleTurn` (`packages/trpc/src/router/agent/agent-worker.ts`). Add one sentence to the main-session prompt in `systemFor` (`createActivities.ts`): "When you start something that takes more than a moment, call set_status with one short line a teammate would understand." Publish `agents.changed` with the `agentId` after a status write so the board refreshes.

API: add `agent.listWorking` to `packages/trpc/src/router/agent/agent.ts` as a person procedure returning, for every non-archived Dev in the organization the viewer may see (reuse the visibility rule `agent.activity` applies): `agentId`, `name`, `avatar`, `engine` (always `pdev` until Milestone 3), `paused`, and `now`: either the status line, or a derived line from the running turn (`replying in #channel`, `working on a mention in #channel`, `replying in a thread`) joined through the trigger message to its channel, or from an active task session (`writer: <task title>`, `reviewer: <task title>`, with the PR URL when present), or `ready`. For people, return `userId`, `name`, `avatar`, presence `active|away`. Keep `agent.get().recentTurns` and `working` unchanged; released desktop 2.0.x reads them (see `packages/trpc/AGENTS.md` and the `trpc-compat` skill before changing any procedure shape).

Desktop: new route folder `apps/desktop/src/renderer/routes/_authenticated/_dashboard/team/` with `page.tsx` and `components/RightNowBoard/RightNowBoard.tsx`, `components/TeammateRow/TeammateRow.tsx`, following the one-folder-per-component rule in AGENTS.md. Subscribe to `agents.changed` the way `ChannelsRealtime.tsx` does and invalidate `agent.listWorking`. A row click opens the Dev page or the person's profile. All strings through Lingui; run `bun run check:i18n` and write the translations.

### Milestone 2: `ask_dev` hand-offs with chain limits

What exists at the end: in a thread where Maya asked Scout for help, Scout can call `ask_dev` to send Ledger a question or a piece of work; the thread shows "Scout asked Ledger: check this list against the numbers" and later "Ledger answered Scout: …"; the Right now board shows "Scout: waiting on Ledger" and "Ledger: checking Scout's list (for Scout)"; Maya can write "stop" in the thread and the chain ends; an organization's daily spend on such chains is capped.

Schema: add to `agent_turns`: `parent_turn_id uuid` (the turn whose ask started this one), `root_turn_id uuid` (the person-started turn at the top of the chain), `depth smallint not null default 0`. Add reasons `dev_request` and `dev_reply` to `agentTurnReasonValues` in `packages/db/src/schema/enums.ts`. Add table `agent_handoffs`: `id`, `organization_id`, `from_agent_id`, `to_agent_id`, `from_session_id`, `from_turn_id`, `to_session_id`, `to_turn_id` (nullable until the target turn exists), `root_turn_id`, `depth`, `acting_user_id`, `text`, `reply` (nullable), `expect_reply boolean`, `status` (`submitted`, `working`, `input_required`, `completed`, `failed`, `canceled`), `dedupe_key` (sha256 of `to_agent_id + root_turn_id + text`) with a unique index on `(root_turn_id, dedupe_key)`, timestamps. Add channel message subtype `dev_handoff` wherever `channelMessageSubtype` is defined (`packages/db/src/schema/enums.ts`; join/leave subtypes were added in commit `18572ac62e`, follow that shape).

Dev tool: `askDev` in `dev-tools.ts`, input `{ dev: string (id or exact name), text: string ≤ 4000, expectReply: boolean default true }`. Steps, in order, each refusing with a message the Dev is told to relay to the person: the organization has hand-offs enabled (D7); the target Dev exists in the same organization, is not archived, is not paused, and is a member of the room the current turn is replying to (so the person could have mentioned it themselves); the current turn's `depth` is below 2; the target does not already appear as `from_agent_id` or `to_agent_id` in this `root_turn_id`'s handoffs; this turn has fewer than 3 handoffs; the dedupe key is new for this root; the organization's sum of `cost_micros_usd` over turns with reason `dev_request` or `dev_reply` started today is under the cap (`AGENT_HANDOFF_DAILY_CAP_MICROS`, documented in `docs/environment-variables.md`, default the equivalent of 20 USD). Then insert the handoff row, call `submitPrompt` into the target's main session with `actingUserId = ctx.principal.askerId`, `promptId = ask:<handoffId>`, `reason = "dev_request"`, text wrapped by the same `eventText` helper the thread path uses, with `from: "teammate <name>, working for <person>"`, `where: "a request from a teammate"`, and the room id of the original thread as the reply target; record `parent_turn_id`, `root_turn_id`, `depth + 1` on the created or joined turn; set the handoff to `working` with `to_turn_id`. Post the mirror message with `sendChannelMessage` as the asking Dev with `subtype: "dev_handoff"` into the thread the person's request lives in. Register the tool as `ask_dev`.

Reply path: in `packages/trpc/src/router/agent/tasks.ts` next to `afterTaskTurn`, add `afterHandoffTurn`, called from `settleTurn` when the settled turn's reason is `dev_request`. It finds the handoff by `to_turn_id`, stores the reply (the turn's `reply` column), marks it `completed` (or `failed` on a failed turn), posts the mirror "Ledger answered Scout: …" with subtype `dev_handoff`, and, when `expect_reply`, calls `submitPrompt` into the asking Dev's main session with `promptId = dev-reply:<handoffId>`, `reason = "dev_reply"`, the same `actingUserId`, and the handoff's `root_turn_id` and `depth` carried over. A `queued` steer that finds the asking turn gone starts a new turn; that is correct, since it is still rooted in the person.

Guards that reuse existing behaviour: `startTurnsForMessage` is untouched, so a `dev_handoff` message never starts turns and the Jev router never sees it (filter `subtype is null` in `recentBefore` and `readChannel` the way join/leave messages already are). A paused Dev (`agents.pausedAt`) is refused as a target. The reconciler's `lost` settle already fails a turn whose worker died; `afterHandoffTurn` turns that into `failed` on the handoff and a reply to the asker saying so. Add a prompt rule to `systemFor`: "Do not ask a teammate again about something it already answered or could not do. When a person writes stop, call stop_task on your tasks and do not ask teammates further."

Stop: a person's "stop" in the thread already reaches the asking Dev as a `thread_reply`. Add `cancelHandoff` as a Dev tool (`cancel_ask`) so the asking Dev can mark a handoff `canceled` and interrupt the target's turn with `interruptTurn` when it is still `working`.

Right now board: `agent.listWorking` reads open handoffs and renders "waiting on <name>" for the asker and "<status line or derived line> (for <asking Dev>)" for the target.

Observability: every refusal and every handoff state change is logged with the chain ids; PostHog events `dev_handoff_started`, `dev_handoff_refused { reason }`, `dev_handoff_completed { depth, costMicros }` so the limits can be tuned.

### Milestone 3: Engine per Dev (Claude Code first)

What exists at the end: when creating or editing a Dev, a person picks "Runs on: Paradev, Claude Code, Codex (coming)"; the Dev page and the Right now board show the engine badge; a Dev on Claude Code does its coding tasks with Claude Code on its box and, if Spike 0 succeeded, its main session with Claude Code in the worker.

Schema: add `engine` enum column (`pdev`, `claude`, `codex`) on `agents`, default `pdev`. Expose it in `agent.create` and `agent.update` and in `turnCredentials` so the worker knows what to run.

Task sessions on a box: add a second activity, `runHostTurn`, to the agent worker. For `engine = "claude"` the workflow calls it instead of `runTurn`. It resolves the box through `resolveTurnHost` (`packages/trpc/src/router/agent/turn-host.ts`), starts a session with host-service `sessions.create` (harness `claude-acp`, the role prompt from `systemFor` as the first prompt, `bypassPermissions`), delivers steers with `sessions.send`, polls `sessions.read` for new items and mirrors them into the realtime session store with the existing write ticket, treats the harness's idle as settle, and records the harness session id on `agent_sessions` for resume after a worker restart. Reports flow through `afterTaskTurn` unchanged. Cost: record token counts the adapter reports in `session/update` usage when present, otherwise leave the cost columns null and label the Right now badge "cost not tracked" until the gateway path exists (D8).

Main sessions in the worker: only after Spike 0 passes. Make `createActivities.ts` engine-aware: a `spawnEngine({ engine, home, prompt, mcpServers })` chooses argv and config files per engine; Dev tools are passed as ACP `mcpServers` for Claude and Codex and as `mcp.json` for pdev; token refresh goes through the forwarder chosen in Spike 0; the reply fallback and `summarizeTurn` get an ACP-generic path that reads `session/update` tool calls and the last agent message instead of pi transcript entries. Keep `permissions.deny: ["Task"]` for Claude main sessions as the worker already does for pdev, so a main session never spawns its own subagents.

Codex: add `codex` to `supportsCloudAgentChat` once host-service confirms the `codex-acp` adapter runs on boxes, then the same two paths apply.

### Milestone 4: Office view

Renderer-only. A new `components/OfficeView/` under the `team` route draws rooms from the channels the viewer is in, one desk per member, with the Right now line as a label, the engine badge on each Dev, and a "meeting" marker between two Devs that share an open handoff. Data comes entirely from `agent.listWorking` plus `channel.list`; no new API. This milestone is last because it is the least valuable without the first three and the easiest to redo.


## Concrete Steps

For every milestone, from the repository root:

    bun run typecheck
    bun run lint
    bun test
    bun run check:i18n

Expected: no type errors, no lint errors, all tests pass, and `check:i18n` lists no untranslated messages for any locale.

Schema changes follow `.agents/skills/db-migrations/SKILL.md`: generate on a fresh Neon branch, run the production safety checklist, never apply against a shared database.

Procedure changes follow `packages/trpc/AGENTS.md` and the `trpc-compat` skill: add, do not rename; keep deprecated outputs that released desktop, mobile and CLI builds read.


## Validation and Acceptance

Milestone 1: with the `channels` flag on, in `bun dev`, open the desktop app, click "Right now" in the sidebar, and see every Dev of the organization with "ready" or a derived line. Mention a Dev in a channel; within a second its row changes to "working on a mention in #<channel>" and back to "ready" when it answers. Ask a Dev to do a long task; the line it sets with `set_status` appears on the board. Unit tests: `agent.listWorking` derivations in `packages/trpc/src/router/agent/agent.test.ts`; the Postgres integration suite for `setStatus` and settle clearing it.

Milestone 2: in a thread, ask Dev A to do something that needs Dev B's input (give the Devs instructions that make this natural). Observe the two `dev_handoff` messages in the thread, the board lines, and A's final answer to the person. Then: pause B and repeat; A tells the person B is paused. Ask A to ask B twice about the same thing; the second ask is refused and A says so. Write "stop" while B is working; B's turn is interrupted and the handoff reads `canceled`. Integration tests in the Postgres suite (`packages/trpc/src/router/agent/*.postgres.integration.ts`) cover: depth refusal at 2, cycle refusal, dedupe, per-turn cap, daily cap, paused target, reply delivered once on a retried settle, and that a `dev_handoff` message starts no turn and is invisible to the Jev router.

Milestone 3: create a Dev with engine Claude Code, mention it in a channel with a coding request; its task runs on the box with Claude Code (visible in the session viewer with harness `claude-acp`), opens a PR, and the Dev reports back. The board shows the Claude badge. Spike 0's transcript is attached under Artifacts.

Milestone 4: the office view shows the same information as the board; switching between the two views loses nothing.


## Idempotence and Recovery

Migrations are additive (new columns with defaults, new table, new enum values) and can be re-run on a fresh branch. `promptId` dedupe (`ask:<handoffId>`, `dev-reply:<handoffId>`) makes a retried `askDev` or a retried settle deliver at most once; the unique `(root_turn_id, dedupe_key)` index makes a retried insert a no-op. If a chain misbehaves in production, set `AGENT_HANDOFF_DAILY_CAP_MICROS=0` or turn the org setting off; existing handoffs settle, no new ones start. The whole feature set stays behind `FEATURE_FLAGS.CHANNELS`.


## Artifacts and Notes

Research sources behind the Decision Log (summaries; the plan does not depend on reading them):

The reference "virtual office" product is most likely Skydive's 3D office (announced 2026-10-30): named agents with roles, own cloud computers, shared identity and memory across channels, routines, per-model billing. Grok Bot documents bot-to-bot messaging ("Bots can independently message each other and share context in threads"), text-only and async, with approvals kept with the person whose message a bot answers, no loop cap, and a warning that "parallel handoffs create duplicate work". Dust's `run agent` tool refuses past recursion depth 4. Claude Code agent teams use per-agent mailboxes, drop identical repeats, rate-limit per sender, cap the queue at 50, and treat a message from another session as never counting as consent. Devin's coordinator launches child sessions with their own compute limits and a toggle to review each batch. A2A 1.0 defines the task state machine and Agent Card we borrow vocabulary from; the ACP subagent RFD (revised 2026-10-30) defines `session_message` with sender and recipient session ids rendered "To/From", and forbids ownership cycles.

Spike 0 transcript: to be added.


## Interfaces and Dependencies

`packages/trpc/src/router/agent/dev-tools.ts` gains:

    setStatus: devProcedure.input(z.object({ text: z.string().min(1).max(120) })).mutation(...)
    askDev: devProcedure.input(z.object({
      dev: z.string().min(1),
      text: z.string().min(1).max(4000),
      expectReply: z.boolean().default(true),
    })).mutation(...)  // returns { handoffId, status: "working" | "refused", reason?: string }
    cancelAsk: devProcedure.input(z.object({ handoffId: z.string().uuid() })).mutation(...)

`packages/trpc/src/router/agent/agent.ts` gains:

    listWorking: personProcedure.query(...)  // returns { devs: DevNow[], people: PersonNow[] }
    // DevNow = { agentId, name, avatar, engine: "pdev" | "claude" | "codex", paused: boolean,
    //            now: { kind: "status" | "turn" | "task" | "handoff" | "ready", text, channelId?, taskId?, handoffId? } }
    // PersonNow = { userId, name, avatar, presence: "active" | "away" }

`packages/db/src/schema/agents.ts` gains `agentHandoffs` as described in Milestone 2, `engine` on `agents`, `statusLine`/`statusLineUpdatedAt` on `agentSessions`, and `parentTurnId`/`rootTurnId`/`depth` on `agentTurns`.

`apps/agent-worker/src/workflows/agentSession/agentSession.ts` gains the `runHostTurn` activity for non-pdev task sessions; `createActivities.ts` gains `spawnEngine` for non-pdev main sessions after Spike 0.

Libraries: nothing new. ACP client from `@superset/chat-runtime/acp-client`, Temporal as today, Drizzle for schema, Lingui for strings.
