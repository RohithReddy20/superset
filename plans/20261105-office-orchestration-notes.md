# Office orchestration: what the prototype does today and what real teamwork needs

Written 2026-11-05 against `office/seat-prototype` at `cef6f6b13d`. Companion to
`plans/20261105-0146-ai-teammates-that-work-together.md` (the cloud "Devs" design); this note is
about the local office harness (`packages/office-harness`, `packages/host-service/src/office`).

## What exists

- **Peers, no lead.** Every AI teammate is equal. Work moves only by `@mention` in a room or
  thread; a mention from an AI creates a hand-off record (`Handoff`: from, to, thread, hop depth,
  status working/answered/held/canceled). There is no owner, no task object, no assignment.
  README: "No work items yet: hand-offs are messages, not owned tasks."
- **Guards** (`guards.ts`): max 3 hops from a person, max 6 AI posts per thread without a human,
  max 3 teammates pulled in per turn, 60 turns per teammate per day, repeated identical asks
  dropped, paused teammates refuse. A person writing `stop` cancels the thread's hand-offs.
- **One process per seat.** `OfficeRuntime.start()` launches every seat at host start: Claude Code
  through `@agentclientprotocol/claude-agent-acp`, Codex through `codex-acp`, agy directly, all over
  ACP. Permissions are auto-allowed (`Seat.answer`). The process stays up and idle until an inbox
  item arrives; a turn is one `session/prompt` with the batched inbox.
- **One long session per seat.** The ACP session id is saved in `state.json`
  (`office.rememberSession`) and `session/resume` or `session/load` is tried on restart. Claude
  Code resumes; the Codex adapter rejected `session/load` so Codex starts fresh; agy untested.
  So a teammate is one continuous conversation, not a new session per message. Context grows
  with every turn; Claude Code compacts on its own, cost per turn still climbs over a long day.
  The only cost cap is the daily turn budget. There is no token or money budget.
- **No workspace.** Each seat's `cwd` is `paradev-dev-data/office-seats/<id>/`, an otherwise empty
  folder holding the norms file (`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`). `buildChatAgentEnv` is
  called with the placeholder `workspaceId: "office"`. "Bash, the coding teammate" has no repo.
- **Tools the seats have** (`officeMcp.ts`): `say`, `set_status`, `who_is_here`, `read_thread`.
  Nothing for files, tasks, branches or PRs beyond what the engine itself can do in its cwd.
- **Engine shown** as a two-letter tag (CL / CO / GE) after the name on the floor pill, and as a
  word in the Right-now rail.

## What a single shared project needs

1. **A task object.** `{ id, title, brief, owner, status: todo|doing|review|done|blocked,
   acceptance, threadId, workspaceId, branch, prUrl, verifierId, budget }`. Lives in office
   state next to messages. Created by a person ("@bash take this: ...") or by a lead seat.
   Hand-offs then attach to a task instead of floating in chat.
2. **A workspace per task.** On assignment, `superset ws create --local --project P --branch
   office/<task-id>` (or the host-service `workspaces` API directly) and start the seat's work
   session with that worktree as `cwd`. Keep the seat's chat session separate from its work
   session: the chat session stays small and cheap; the work session is per task and is thrown
   away when the task closes. This is also the cost fix: no single ever-growing context.
3. **A lead role.** One seat (or the person) may assign, reassign, split and close tasks, and is
   the only one allowed to mark `done`. Others may only move their own task to `review`.
   Lead tools: `create_task`, `assign`, `split`, `close`, `read_board`.
4. **Verification before a person sees it.** `review` means: tests ran green in the task
   workspace, and a second seat (never the author) read the diff and posted a verdict on the
   task thread. Only then does the task reach the person as "ready". This is the practical
   version of "less dependence on humans": the human decides, the agents check.
5. **Engine icons.** Replace the CL/CO/GE tag with the engine mark in front of the name
   (`FloorOverlay.tsx` pill and `RightNowRail`). Small change.
6. **Budgets per task** (turns and, once engines report usage, tokens), surfaced on the task
   card, in addition to the daily per-seat turns.

## Outside reading, checked 2026-11-05

- **DeepSeek Harness (`dsh`)**, open-sourced 2026-08-13, MIT, v0.1 developer preview, Node.js,
  built on the Cordis framework, repo `github.com/deepseek-ai/deepseek-harness`. Everything is a
  plugin: model adapter, tool registry, session log, agent loop, sandbox, UI. Append-only session
  trajectory records messages, tool calls, token metrics and sub-agent dispatches, usable for
  replay. Coverage says it ships subagent providers that delegate to Claude Code and Codex
  binaries on PATH, but the pages read do not say how results come back or whether those
  sessions persist. README warns of breaking changes. Relevance: a candidate runtime for a lead
  seat that fans work out to the engines, and its replayable log is the kind of observability
  the office lacks. Not a reason to rebuild now; it is a preview.
- **"Engineering Reliable Coding Agents: Evaluating and Operating the System Around the Model"**
  (arXiv 2608.13867). Review of 164 papers, 100 practitioner records, 29 benchmarks. Claim:
  reliability comes from the harness, state, permissions, retrieval and review interfaces around
  the model, and systems must recover safely when a part fails. Most useful of the three for
  hand-offs between agents: the failures are state, permissions and recovery, exactly points 2
  and 4 above.
- **"The Verification Horizon: No Silver Bullet for Coding Agent Rewards"** (arXiv 2606.26300).
  Checking output is now harder than producing it; every verifier is a proxy for intent; targeted
  verification (tests plus an agent judge plus behaviour monitoring) curbs reward hacking.
  Supports point 4: tests alone are not enough, add a reviewer seat.
- **"AI Agents Push Humans Out of the Loop"** (arXiv 2608.23642). Position paper arguing the
  opposite of the title's wish: oversight erodes skills, so design for the overseer. Supports
  keeping the person as the only one who closes a task.

## Progress, 2026-11-05 evening

Points 1 to 5 above are built on `office/seat-prototype` and were run end to end in the dev app
against a scratch repository with a one-line test gate:

- Tasks live in office state (`Office.createTask/assignTask/updateTask`) with the ownership rules
  from point 3; the seats get `read_board`, `read_task`, `create_task`, `assign_task`,
  `update_task`; the app gets `office.createTask/assignTask/updateTask` and a Tasks tab.
- `OfficeRuntime` creates `office/<task-id>` as a git worktree under `<app home>/office-work/`,
  runs the owner's work session there (a fresh ACP session, closed after the turn), runs
  `project.testCommand` when the owner reports review, then runs the verifier's review session,
  and only a person or the lead can mark done. Rounds are capped per task.
- Observed run: T-1 assigned to Bash (Codex) → doing → one commit on `office/t-1` → review →
  `sh test.sh` passed → Scout (Claude) read the diff and marked verified → closed from the app.
  Two rounds, about five minutes, no console errors.
- Config: `project.repoPath`, `project.baseBranch`, `project.testCommand`, `lead`, `verifier`,
  `limits.taskRounds` in `office.json`.

Not done yet: the worktree is not registered as a Paradev workspace (it is a plain git worktree,
so it does not show in the sidebar); no PR is opened; no token budget, only rounds; the review
session has no "changes requested" loop test yet beyond the code path.
