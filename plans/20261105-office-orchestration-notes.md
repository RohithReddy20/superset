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

## 2026-11-06: a bigger office, a camera, and talking to a group

The floor was one 28x18 room fitted to the pane. It is now a 52x34 office with walls and doorways,
and the view follows the person instead of fitting the map.

- **Map.** `scripts/office-tileset.ts --map` builds it from wall rectangles, doorways and painted
  floor materials. Wall tiles are chosen per cell: a wall cell with floor below is a face, any
  other is a cap, and caps outline the sides that drop. Rooms: engineering (8 pods), huddle room
  (the first `meeting` zone, where hand-off pairs meet), meeting room, phone booths, library,
  kitchen (counter and four tables), lounge (sofa, armchairs, ping-pong), design studio (2 pods
  and a review table). Zones carry `label`, `signX`, `signY`; areas with no chat room in them
  show their label on the floor.
- **Camera.** Zoom steps 1, 1.5, 2, 2.5, 3; the start zoom shows about 18 tile rows. Wheel or the
  -/+ buttons step; zooming out past 1 shows the whole office. Dragging the floor pans and stops
  following until you move again. The overlay is positioned on `POST_RENDER`, after the camera
  has moved, so name tags do not trail the sprites by a frame.
- **Mouse.** Double-click walks; a single click picks the room under it and clears the picked
  group. Clicking an AI teammate picks it (Shift/Cmd adds), Shift-drag picks everyone in a box,
  Esc clears. Dragging a picked teammate, or its name tag, carries the whole group; dropping it on
  another chat room's area calls `office.moveTeammate` for each, anywhere else they walk back.
  Room signs hang under their area and tags shrink to a face below zoom 1, so neither covers
  the people in the whole-office view.
- **Group chat.** Picking teammates opens a small chat at the bottom left. Its thread in each room
  is the person's latest root message there whose mentions equal the group
  (`utils/groupThreads`). The first message mentions everyone and starts that thread; later ones
  are thread replies, which reach them as thread participants. Posting in a room the person is not
  in makes them a member (`OfficeRuntime.joinRoom`), their home room stays.
- **Checked in the running app (CDP, renderer 3005):** single click does not move you, double-click
  walks, drag pans and the camera returns on an arrow key, Shift-click and Shift-box pick, Esc
  clears, dragging Scout carried Scout and Bash into planning, dragging Bash's tag brought both
  back, a group message to Scout and Bash got an "ok" from each in the chat, and a follow-up
  without mentions reached them. No console errors.
- **Open:** only areas that hold a chat room accept a drop (an empty pod cannot become a room by
  dropping); a group spread over rooms gets one thread per room; Scout answered "thanks, that is
  all" with a message saying it would not reply, so the seat norms should say to stay silent
  when there is nothing to add.

## 2026-11-06 later: quick fixes

- **Agents keep quiet when nothing needs an answer.** The seat posted an engine's closing text for
  it whenever the engine had not called `say`, so a model that decided not to answer still had
  its reasoning ("closes the thread, so I'm not replying") posted. The norms now tell it to end
  with "no reply" in that case, and `fallbackReply` (seat/prompt.ts) drops a closing text whose
  last line is that marker. Checked live: "thanks, nothing else needed" to Scout, a turn ran,
  nothing was posted.
- **Usage per teammate and per task.** Each turn's `PromptResponse.usage.totalTokens` (cache reads
  included; both adapters report it) is added to the teammate's day and, for task sessions, to
  the task (`Office.recordUsage`, `TurnContext.taskId`). Dollars come from `usage_update.cost`,
  which only the Claude adapter sends; it is a running session total, so the seat records the
  change over the turn. The teammate card and task cards show "87K tokens · $0.03"; Codex shows
  tokens only. Checked live on Scout (Claude) and Bash (Codex).
- **New room on empty desks.** Rooms can carry a `place` (a floor zone id); `layoutWorld` puts a
  placed room there and fills the other areas in order. Carrying teammates over a desk area with
  no room shows "New room here"; dropping asks for a name, creates the room at that place
  (`office.addRoom` with `place`) and moves them in; cancel walks them back. Checked live with
  Ledger, then the test room was removed from the config and state by hand: the office has no
  way to delete a room yet.
- Side effect found while testing: `moveTeammate` drops a teammate from its old home room, so a
  round trip (design to planning and back) also removed Scout and Bash from planning, which they
  had been members of as a second room. Restored by hand. Moving should probably only change the
  home room and leave other memberships alone.
- **Group chat is one private room now.** The first version posted once per room the group sat in
  (a thread reply in one, an @mention root in another), so one send showed as two messages.
  `office.openGroup` finds or makes a `dm` room `group-<ids joined by +>` with the person and the
  picked AI teammates; a person's message in a `dm` room reaches every AI member without
  mentions, and their replies land in that room. The floor's chat shows that room; room tabs
  skip `dm` rooms. Checked live: one message to Scout, Bash and Ledger across two rooms, three
  "ok" replies in the chat.
- **Seats stay put.** `layoutWorld` re-dealt every seat in id order on each change, so one move
  shifted others. It now takes the last layout's `homes` as `previous` and keeps each seat while
  it still belongs to the teammate's room; newcomers take a free seat, the one nearest where
  they were dropped when the floor passes a `SeatHint`. Checked live: moving Ledger into Design
  and back left Scout and Bash in place, and Ledger returned to its own desk.

## 2026-11-08: small fixes

- **Moving keeps the other rooms.** `OfficeRuntime.moveTeammate` took the teammate out of its old
  home room, so a round trip (design to planning and back) also dropped Scout and Bash from
  planning. A move now only changes the home room and adds the new room when missing; every other
  membership stays. Regression test in `officeRuntime.test.ts` (failed on the old code).
- **Seats survive a restart.** Each teammate now has a `desk` (`zoneId`, `x`, `y`) in office state
  (state.json), next to the rest of the office. The floor still owns the seat choice: after each
  layout it sends the homes that differ from the stored desks (`office.setDesks`), and a floor
  with no layout yet (a fresh window) uses the stored desks as `previous`. A desk whose area or
  seat is gone from the map, or that is outside the room's area now, is dealt again as before.
  Host state rather than renderer localStorage: the office state is the source of truth, the desk
  goes away with the teammate, and localStorage is kept for small singleton UI state
  (apps/desktop/AGENTS.md).
- **Rooms can be deleted.** `Office.removeRoom` (harness) holds the rules, `OfficeRuntime.deleteRoom`
  mirrors them into office.json, and `office.deleteRoom` exposes it. A trash button at the end of
  the room tabs opens an in-app confirm (AlertDialog, no native dialog) that says how many
  messages go and who moves. Choices:
  - Whoever lived there moves to the first other room they are a member of, else to the first
    room; they stay members of their other rooms.
  - The room's messages and hand-offs are deleted with it, like deleting a channel.
  - A room that holds a task's thread is not deleted (the task's sessions and notes post there),
    even when the task is done; the dialog shows the reason. This keeps #engineering, which has T-1.
  - The last room is not deleted, and the button is disabled when only one room is left.
  - Group chats (`group-<ids>`) are not deleted: they have no tab or sign, nobody lives in them,
    and `openGroup` would make the same room again on the next message to that group.
  - The room's floor place is freed because the room is gone from config and state; the area
    takes "New room here" drops again.
- **Checked in the running app (CDP 9333, renderer 3005, office route):**
  - Dragged Scout (home Design, also in planning and engineering) into planning and back. Its home
    changed both times and every room kept the same members.
  - Noted the seats, touched `officeRuntime.ts` so electron-vite restarted the main process and
    the host service (new renderer page, host on a new port). Everyone sat at the same desk.
    Scout was at a desk where the old dealing would not put it.
  - Dropped Ledger on the empty desks under hhhhh and named the room "Scratch test". Posted one
    message there. Tried to delete #engineering, which was refused with "T-1 keeps its thread in
    engineering". Deleted Scratch test through the confirm: the room, its sign and its message
    were gone, and Ledger moved to engineering. Ledger was then moved back to hhhhh with the
    teammate card.
  - No console errors. Afterwards office.json was the same as the backup, and state.json differed
    only by the new desks.

## 2026-11-08: the city (step 1, watch)

A new view at `/office/city` (the office header has a "city" button) shows the CLI agents that run
in this machine's workspace terminals. It reads only what the app already tracks; nothing new runs
on the host.

- **Data.** `useCity` joins `useHostProjects`, `useHostWorkspaces` (only rows whose `hostId` is this
  machine) and `terminalAgents.list` on the local host, polled every 1.5 s. Each binding's status is
  `deriveTerminalAgentStatus` with the notification store's `terminalSeenAt`, the same rule as the
  sidebar's agents chip. Pure join in `city/utils/buildCity`. Two agents of one kind in a workspace
  are "Claude" and "Claude 2".
- **City.** `CityScene` (Phaser) draws one building per project on a grid of lots, oldest project
  first: one floor per workspace (up to 6, the rest are counted), one window per agent (up to 4 a
  floor). Windows are lit by status: amber working, orange blinking needs you, green done, red
  failed, dim blue idle, dark empty. Art is drawn in code with the tileset `Sprite`
  (`scene/art.ts`); lots are sized to the tallest building. DOM signs over each roof give the name,
  icon and counts. Click a building (or its sign) to enter; drag pans; wheel and buttons zoom.
- **Building.** The office floor, reused: `buildingSnapshot` turns the project into an
  `OfficeSnapshot` with a room per workspace and an `ai` teammate per agent (status as bubble line
  and dot colour, agent icon from the preset icons). The scene payload and `FloorOverlay` take
  `canCarry: false`, so nobody can be dragged to another workspace. The view opens on the whole
  floor. Clicking a person opens a panel with its workspace, status, last change, helper count, the
  tail of `terminal.transcript` (polled every 2 s) and "Open its terminal", which navigates to the
  workspace with `terminalId` + `focusRequestId`. Clicking a room's sign lists that workspace's
  agents and opens it. Long room names are truncated on signs.
- **Checked in the running app (CDP 9333, renderer 3005).** Imported two scratch repos into the dev
  app as projects (city-demo-api, city-demo-web) and created three workspaces with a Claude or Codex
  agent each. The city showed two buildings with their counts; windows went yellow while Claude ran a
  45 s shell command and green when turns ended; entering city-demo-api showed both workspaces as
  rooms with the agents at desks; clicking Claude showed "Working" then "Done" and its transcript;
  clicking a room's sign listed Codex; "Open its terminal" opened the Codex terminal in its
  workspace. The office still loads and its teammates can still be dragged. No console errors.
- **Found while testing.** A fresh CLI waiting at its own "trust this folder?" prompt shows as idle:
  no lifecycle hook fires before the first turn. The city cannot tell it needs you; the panel's
  transcript shows the prompt.
- **Not checked live.** The blinking "needs you" window (the test agents ran with permissions
  skipped), failed agents, more than 6 workspaces or 4 agents on a floor, and remote or cloud hosts
  (not shown at all).
- **Debt.** The city imports the office floor's scene, overlay and controls across folders; if it
  stays, move them to a shared place. `AgentPanel.tsx` holds four small components.

## 2026-11-08 later: talking to CLI agents from their building (step 2)

- **One agent.** The panel is now a chat. When the agent keeps its own record (`terminal.transcript`
  source `harness`: Claude, Codex) `parseTurns` splits it into "To it" and agent bubbles; other
  agents show their raw terminal output. A message box sends with `terminal.send` (bracketed paste,
  then Enter); a CLI that is mid-turn queues it itself (Claude and Codex both show it as queued).
  "Answer its screen" buttons send one key with `terminal.writeInput` (↑, ↓, Enter, Esc), for
  permission prompts and "trust this folder?". "Terminal" opens it in its workspace as before.
- **Several agents.** Shift-click or Shift-drag picks people on the floor; with two or more a
  floating box lists each with its status and latest words (`lastReply`), and one message goes to
  every picked terminal. Failures are named in the box. Esc clears the pick.
- **Checked in the running app.** Messaged Claude "Reply with only the word pong." and saw "pong" as
  its bubble. Picked Claude and Codex, sent "Say the word ready." from the group box: Claude's row
  showed "ready"; Codex was still on the earlier question (its screen showed the new message
  queued "after next tool call"). Created a fresh project whose Claude stopped at "trust this
  folder?", opened it, pressed ↓ then Enter in the panel: it started and answered "started". No
  console errors.
- **Not yet.** Agents cannot message each other (step 3), the reply in the group box is the
  agent's last words, not matched to the message that was sent, and a CLI's own numbered prompts
  still need arrow keys rather than named answers.
