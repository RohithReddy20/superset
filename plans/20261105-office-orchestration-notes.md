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

## 2026-11-08 evening: seating and room talk (hand-off plan part 1)

The person's rule: an agent can sit anywhere in the city, but its workspace, folder, terminal and
branch never change by sitting. Moving work to another workspace is a separate, explicit hand-over
(part 2, not built).

- **Host: `office/cityRooms.ts`, wired in `office/createCityRooms.ts`.** Seats
  (`terminalId → projectId/roomId`, rooms being a workspace id or `meeting`) and each room's talk live
  in `<app home>/office/city.json`. An agent with no seat sits in its own workspace's room. The event
  bus gained `onAgentLifecycle` (in-process, like `onTerminalLifecycle`); on `Stop` the city reads the
  agent's last answer (`transcriptSession`, harness record first), and when the agent shares a room
  and @mentions a roommate (or @all), types the answer into each mentioned roommate's terminal
  (`sendAgentMessage`) with who it is from and how to answer. Handles are the agent kind
  (`@claude`), with the workspace added when two of a kind share a room
  (`@claude-check-health`). A newcomer to a room with others gets a brief: who is there, their
  handles, that its workspace has not changed, and to mention nobody when it has nothing to say.
  After 8 passed messages without a person speaking the room pauses; a person's message to the room
  or "Let them continue" resumes it. A message that cannot be typed into a terminal is noted in the
  room ("Could not reach @x: …"). tRPC: `office.cityState`, `citySeat`, `cityHome`, `citySay`,
  `cityResume`.
- **Renderer.** Buildings show everyone sitting in them, visitors with "· their workspace" in the
  name, plus a Meeting room (the map's meeting room). Dragging a person onto a room seats them
  ("Sit in X"; empty desks do nothing, `seatOnly`). The agent panel shows where it sits, "Send home",
  and a picker of every room in the city, which is how an agent visits another building. A room's
  sign opens its panel: who is here with handles, the talk, the pause notice and a box to message
  everyone there.
- **Checked in the running app.** Dragged a Claude into the api building's meeting room and sent the
  web project's Claude there with the picker; both sat there with handles. After a host restart two
  fresh Claudes (api "Check health", web "Plan release") were seated there and the room was told to
  have one ask the other which files are in its folder: the question and the answer were each typed
  into the other's terminal and shown in the room. "Send home" put the visitor back at its desk. No
  console errors.
- **Found.** A host restart (here, from editing host-service) left an agent's terminal dead while
  its binding still listed it as running; messages to it failed silently before the "Could not
  reach" note. Agents resumed into a new terminal lose their seat (seats are keyed by terminal).
  An answer that names a roommate only to talk about them ("@x answered: …") is still passed on;
  the pause bounds it.

## 2026-11-08 night: quieter room talk, and a real two-project job

Reading both agents' records after the first room test showed waste: the separate welcome cost a
turn ("Noted, nothing to send"), only the newcomer learned who was in the room, and a closing line
that named the other agent ("@x answered: …") was passed on and cost it a turn too.

- Seating types nothing into any terminal now. The first message an agent gets in a room is led by
  a short note (room, its own @handle, who else is there and where they work, workspace unchanged,
  how to talk, and to write only "no reply" when it has nothing more). Later messages carry a
  "Now in …" line only when the people in the room changed.
- An answer with a line that is just "no reply" is never passed on, even if it names someone.
- Checked live with two fresh Claudes seated in the api building's meeting room ("Version endpoint"
  in city-demo-api, "Version badge" in city-demo-web). One room message asked the first to write
  and test a Node server on port 4517 (GET /version → {"version":"1.2.0"}) and hand over its URL,
  shape and path; the second to write client.js `fetchVersion(url)`, test it against that server and
  report back. In about 20 s: endpoint wrote and tested server.js and told badge; badge (which had
  answered the first message with "no reply" while it waited) wrote client.js, ran it against the
  server, stopped it and reported "It worked"; endpoint ended with "no reply", which was not passed
  on. Two messages passed in all, four turns in all, no pause. Running client.js against server.js
  outside the agents returned "1.2.0" and threw on a 404; each agent only added a file in its own
  folder.
- **Seats survive an agent's restart.** A seat now records the agent's own workspace. When its
  terminal is gone, the seat follows `findResumedSuccessorTerminalId` to the terminal the agent
  continued in; otherwise it is kept for a day from when the agent went missing, then dropped.
  Checked live: seated a fresh Claude ("Seat test") in the api meeting room, restarted the PTY
  daemon (`terminal.daemon.restart`, which killed its terminal and ended its binding), resumed it
  (`terminalAgents.resume`, as a terminal pane does on mount): it came back in a new terminal and
  was still in the meeting room as @claude-seat-test.
- **Still open.** Agents whose terminal died while their binding was not ended (two from earlier
  tests, after a host restart) still list as running; messages to them are noted as "Could not
  reach" in the room.

## 2026-11-08 night: hand-over to another workspace (part 2)

Seating never moves work; a hand-over does, and only when the person starts it or approves an
agent's own request.

- **Host (`CityRooms`).** `handOver` (you) or `approveHandover` (an agent's request) types a brief
  request into the agent's terminal: write what was asked, what is done, what is left, the files
  and decisions that matter, starting with "HANDOVER BRIEF". On that agent's next `Stop` the brief
  is read, a new agent is started in the target workspace (`runAgentInWorkspace`, the app's own
  launch path) with the brief, the person's note and the old agent's exact @handle, seated where
  the old one sits, and the old one is told to stop and answer questions. An agent writing a line
  "HANDOVER REQUEST: <where> - <why>" (the room note tells agents they can) creates a request that
  waits for the person; declining tells the agent to carry on. A hand-over waiting for its brief can
  be cancelled. tRPC: `office.cityHandOver`, `cityHandoverApprove`, `cityHandoverDecline`,
  `cityHandoverCancel`; `cityState` carries `handovers`.
- **Renderer.** The agent panel has "Hand its work to another workspace…" (target workspace, new
  agent kind, note), shows the hand-over's state (writing its brief, starting, done with "Show the
  new agent", failed), "Took over from …" on the new agent, and Approve/Decline with a workspace
  pick for an agent's request. The city header counts waiting requests.
- **Checked live** (no app restarts; agents started through the host, the app driven over CDP):
  - You: a Claude in city-demo-api "Release notes" had written three repo facts; handed over from its
    panel to city-demo-web "Plan release" with a note. Its brief was thorough (task, done, where the
    file is, what is open, what matters for the new workspace); the new Claude started there with it,
    wrote the facts into city-demo-web/notes.txt, stayed in its folder; the old one answered the stop
    message with "no reply"; the new one sat next to it with both handles in the room.
  - Agent: told in the room to commit server.js in city-demo-api, the web Claude refused to leave its
    folder and wrote a HANDOVER REQUEST. The header showed "1 hand-over request"; approving it from
    its panel to api "Version endpoint" produced a brief and a new Claude there, which committed only
    server.js ("Add version server") and reported back by @handle.
- **Open.** New agents are only started in existing workspaces (no "new workspace" option yet); the
  old agent is told to stop rather than closed; requests only reach agents that sat in a room (the
  note is part of the room introduction).

## 2026-11-08 night: CLI agents in office rooms (part 3)

- **How.** "Office" is one more place in the city (`projectId: "office"`, `roomId` an office room).
  The city keeps the office's guests equal to the agents seated there (`OfficeRuntime.syncGuests`).
  `OfficeGuests` makes each one an office teammate (`cli-<terminal>`, named
  `<kind>-<workspace>`, e.g. `claude-office-guest`, role "Claude CLI, working in …") and a member of
  its room (`applyRooms` adds guests to config rooms without writing them to office.json). Its inbox
  types into its terminal: a first note (room, its @name, who is there, workspace unchanged), up to
  four earlier thread messages, the message, and how to answer ("no reply" to stay quiet). When its
  turn ends its answer is posted in that thread as its message, at the depth it was given, so the
  office's own limits apply. It leaves the office (removed as a teammate, `Office.removeTeammate`)
  when it sits elsewhere or stops running; leftovers from an earlier run are removed on the next
  sync. The city's seat picker lists "Office, with its teammates".
- **Built without restarting the running app.** Work happened in a separate worktree
  (`office/part3-guests`), tested there (host 24 tests, typechecks of host-service, office-harness
  and desktop), then fast-forwarded in one go: one restart.
- **Checked live.** A fresh Claude CLI in city-demo-api was seated in the office's Design room from
  its city panel; the office listed it as `claude-office-guest` with You, Scout and Bash. "@claude-
  office-guest what does README.md in your folder say? … then ask @Scout for one idea" in Design: the
  CLI read its README, answered in the thread and mentioned @Scout; Scout (the office's ACP
  teammate) answered in the same thread with a suggestion. The office's Right now rail showed the
  CLI with its Claude mark.
- **Queued, not yet in the running app** (commit ac30d496dd on `office/part3-guests`): the guest is
  set back to idle after answering, and a message from the office's person, who is named "You" in
  this office, reads "The person running this office mentioned you" rather than "You mentioned you".

## Starting agents from the city, names, identity (2026-11-08)

- A workspace room's panel shows the CLIs of that workspace's own agent bar: the
  `v2TerminalPresets` rows matched to the project, pinned to the bar and linked to an enabled
  agent config (every enabled config when none is). A click calls `office.cityStart`, which runs
  the agent through the same `runAgentInWorkspace` as the bar, with an optional first task.
- Names: `CityRooms` keeps `names` in `city.json` next to seats. A running agent with no name
  gets the first free one of `AGENT_NAMES` (Ada, Milo, Iris, ...). A name follows its agent to a
  successor terminal and is kept 24 h after it stops, the same as a seat (`follow()`). The @handle
  is the name in lower case (`handleOf`), so it is the same in every room; renames that clash, or
  that use "all"/"everyone", are refused. Office guests take the city name too.
- Identity: the first thing the city types into an agent (room message, direct message through
  `office.cityTell`, a hand-over prompt, a city start) begins with "You are <name> (@handle), a
  <kind> agent working in workspace ... of project ...". A rename clears `told`, so the next
  message says the new name. An agent started from the city with no task is asked to say who it is.
- Checked live: started Claude from a room (named Milo, said "I'm Milo (@milo) ..."), renamed it to
  Bolt (a clash with Ada was refused), asked "who are you?", it answered as Bolt.
- Gaps: agents started outside the city learn their name only when the city first talks to them;
  a terminal opened from the city shows as a workspace tab only after "Terminal" is clicked.

## 2026-11-08: UI/UX pass (renderer only, no host changes)

From a design review of the city and the office. What changed:

- **"Needs you" bar** under the header of the City and the Office (`components/NeedsYouBar`,
  `utils/needsYou`). One row of chips, most urgent first: an agent waiting for an OK, a failed
  agent, a hand-over request, a blocked task, a checked task waiting to be closed, an agent that
  finished. A chip opens the agent in its building (`?project=…&agent=…`) or the office's Tasks tab
  (`/office?tab=tasks`). "Nothing needs you right now" when empty, so the layout does not jump.
- **Opening a finished agent marks it seen** (`markTerminalSeen` with the binding's
  `lastEventAt`), the same as focusing its pane in the workspace.
- **Map / List switch** (`?view=list`). The list groups agents by building, needs-you first, with
  where each works, where it sits when visiting, status and last change; a row opens the same agent
  panel. The office's AI teammates are listed first and open the office.
- **The office is a building in the city**, first on the map, a floor per chat room and a window
  per AI teammate (`city/utils/officeBuilding`). The sidebar's Office item opens the City; the
  office header is a "City › Office" breadcrumb.
- **Buildings open on the people** (`OfficeScene.showEveryone`, zoom capped at 2), not the whole
  floor where agents were tiny faces. The control toggles "Everyone" / "Whole floor".
- **Readability.** Office status notes are grey with a "status" tag, not red italics. Long messages
  fold after six lines with "Show more" (`components/LongText`). Header counts, buttons, tabs and
  room signs use normal sentence-case text instead of small uppercase monospace. Room signs drop the
  `[ ]` brackets for a chat icon, so a chat room differs from a plain area label.
- **Room panel.** "Open workspace" is at the top; "Start an agent here" is folded unless the
  workspace has no agent; the message box is disabled with a reason when nobody sits there.
- **Accessibility.** Pulsing and the city's blinking windows stop under "reduce motion"; name tags
  read out their status; hint bars wrap instead of being cut off.
- Shared pieces of the agent panel (`AgentPanel`, `AgentIcon`, `StatusBadge`, `MessageBox`) moved
  from `BuildingView/components` to `CityScreen/components`, since the list uses them too.

Checked in the running app (CDP 9333, renderer 3005): the City shows the Office building and the bar;
the "Done, take a look" chip opened Bolt in city-demo-api framed at a readable size and the item
cleared; a room sign opened the new room panel; the list showed the office teammates and Bolt and
opened Bolt's panel; the Office showed the breadcrumb, new buttons and grey status notes. No console
errors. Not checked live: the tasks chip (no blocked or checked task existed), a "Needs your OK"
chip, reduced motion.

## 2026-11-08: questions on an agent's screen, and simpler controls

- **"Trust this folder?" and other on-screen questions.** No hook fires while a CLI waits at its own
  menu, so the city reads the screen (`terminal.snapshot`, the host's headless emulator, already
  there) of agents that have not started a turn (`Attached`) or are mid-turn (`Start`), every 2.5 s
  (`city/hooks/useAgentScreens`). `city/utils/screenAsk` finds a menu at the bottom of the screen: a
  block of option lines with one under the cursor (`❯` or `›`), either numbered or above a menu
  footer ("Enter to confirm", "enter continue", "esc skip"). An agent with one counts as "Needs
  your OK" with the question as its line ("Asks to trust this folder"), in its bubble and in the
  "Needs you" bar. Samples came from the real CLIs: Claude's trust menu is not numbered and its
  cursor starts on "No, exit", so pressing Enter blind would quit.
- **Named answers.** The agent panel shows "<name> asks: <question>" with one button per option; a
  click sends the arrow presses from the cursor to that option, then Enter (`keysToChoose`, 60 ms
  between keys). The raw ↑ ↓ Enter Esc keys stay below for anything not recognised.
- **Controls.** Double-click on the floor no longer walks you (the first click already opens the
  room, so the two fought); the arrow keys still walk. A "?" button on the floor controls lists
  every control of that floor. A building re-frames on its agents when one arrives or leaves,
  unless you moved the view.
- **Checked in the running app:** started Codex from the Rotate logs room in city-demo-ops. Its
  screen showed Codex's "Trust this folder?" menu; within seconds the bar showed "Asks to trust
  this folder · Milo", the chip opened Milo with "Milo asks: Trust this folder?" and the buttons
  "Trust and continue" and "Quit". "Trust and continue" started Codex, which answered its
  introduction, and the bar went back to "Nothing needs you right now". Double-clicking the
  office floor left your avatar and the room signs where they were. The "?" list opened. The pulse
  animation only applies under `prefers-reduced-motion: no-preference`.
- **Task item in the bar, checked live:** opened T-2 ("Add ok line to notes", Bash, checked by Scout)
  from the Office. About two minutes later the City's bar showed "Checked, ready to close · T-2";
  the chip opened the Office on its Tasks tab (`/office?tab=tasks`) with T-2 verified; "done" closed
  it and the bar went back to "Nothing needs you right now". No console errors.

## 2026-11-09: tasks for any agent in the city

The office's task flow (owner works, tests run, a second agent checks, a person closes) now works for
the CLI agents in the city's workspaces, without the office's own seats.

- **Host: `office/cityTasks.ts`, wired in `createCityRooms.ts`.** A task (`C-<n>`) belongs to one
  running agent in its own workspace. Giving it types a brief into the agent's terminal: what to do,
  what done means, its folder and branch, what will check it, and to end with `TASK DONE: …` or
  `TASK BLOCKED: …`. The commit checked out at that moment is kept as the base. On the agent's
  `Stop` the city reads its last answer; `TASK DONE` runs the task's check command in the workspace
  (if any), then starts a checker (Claude or Codex, through `CityRooms.start`, so it gets a city
  name) in the same workspace with the base, the report and the check result, told not to change
  anything and to end with `VERDICT: PASS` or `VERDICT: FAIL: …`. A failed check or a FAIL goes back
  to the agent as the next round (3 rounds, then blocked); a PASS, or no checker, makes the task
  ready for the person, and the checker's terminal is closed. Ready tasks can be closed, sent back
  with a note (which gives the agent 3 more rounds) or turned into a pull request: the agent is
  asked to push and open one and to end with `PR: <url>` or `PR FAILED: …`; a URL closes the task
  with its link, a failure leaves it ready and says why. State is
  `<app home>/office/city-tasks.json`; the last check command per project is offered again. A task
  only changes after its message reached the agent; when a terminal is not connected the error says
  to open it once and try again. tRPC: `office.cityTasks`, `cityTaskGive`, `cityTaskSendBack`,
  `cityTaskPullRequest`, `cityTaskClose`, `cityTaskCancel` (all new, nothing changed shape).
- **Renderer.** The agent panel has "Give it a task" (title, what done looks like, check command,
  which agent checks it) and a task card: each step in words, the agent's report, the check result
  with its output, the checker's verdict, why a pull request could not be opened, the history, and
  the buttons that fit the step. A checker's own panel says what it is checking. Ready and blocked
  tasks are in the "Needs you" bar (in place of the agent's own "done"); the list shows each agent's
  open task.
- **Checked in the running app** (city-demo-api, scratch repo with no remote):
  - C-1 "Add HEALTH.md" to a fresh Claude (Iris) with the check `test "$(cat HEALTH.md)" = ok` and a
    Claude checker: Iris committed only HEALTH.md, the check passed, the checker (Otto) read the
    diff and passed it within 10 s and was closed, and the bar showed "Checked, ready to close · C-1".
    "Ask for a pull request" came back as "No pull request: the repository has no git remote".
  - C-2 "Add v2 line" to another Claude with no check and no checker: ready in 12 s; asking for a pull
    request showed "Couldn't open a pull request: The repo has no git remote…" on the card (the agent
    declined to create a GitHub repo on its own); Close made it Done and the bar went back to
    "Nothing needs you right now". The repo has the two commits and nothing else.
  - The unit tests cover a failing check running out of rounds, a FAIL going back, a pull request URL
    closing the task and an unreachable terminal changing nothing.
- **Found.** A host restart leaves running agents' terminals unreachable ("Terminal session … is not
  active") while the city still lists them as Idle; opening the workspace then resumed an older
  Claude session in a new terminal rather than reconnecting the one the city showed. Before the fix
  above, that also stranded C-1 in "Opening a pull request". The city should say an agent's terminal
  is not connected (snapshots fail) and offer to reconnect it. The agent panel's conversation also
  shows Claude's `</pasted_content …>` wrapper on messages typed into it.
