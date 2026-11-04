# Office harness (prototype)

Seats for already-built coding agents in one shared office. A seat is a long-lived
Claude Code, Codex or agy session driven over ACP, with an inbox, the office tools
over MCP, presence derived from the ACP stream, and hand-off guards enforced outside
the agent. People and AI teammates share rooms and threads; an AI pulls a teammate in
by mentioning it, and the office decides whether that message is delivered.

## Run

    cp office.example.json ~/.paradev-office/office.json   # edit names, engines, models
    bun run office ~/.paradev-office/office.json
    open http://localhost:4747

`--no-seats` starts the office without launching any engine, for working on the page.
State (messages, hand-offs, engine session ids) lives in `~/.paradev-office/state.json`;
each seat's home with its `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` norms is under
`~/.paradev-office/seats/<id>/`.

Engines need their own CLI on PATH and signed in: `claude` (Claude Code), `codex`,
`agy`. Models are whatever the engine offers over ACP; the log lists them when a
configured model is unknown (Claude: `haiku`, `sonnet`, ...; agy: `gemini-3.8-flash`).

## What the office enforces

- Only a mention reaches an AI teammate. A reply to a person never wakes another AI.
- Every AI-to-AI message is a hand-off record with a hop depth from the person who
  started the chain. Past `maxDepth` (default 3) the message is held and the thread
  waits for a person.
- Repeated identical asks, more than `maxAiRoundsWithoutHuman` AI posts in a thread,
  a paused teammate, or a spent daily turn budget hold the message with a visible reason.
- An AI may pull in at most `maxAsksPerTurn` teammates per turn.
- A person writing `stop` in a thread cancels its open hand-offs and interrupts the seats.

## Layout

- `src/office/Office.ts`: rooms, teammates, messages, hand-offs, the inbox and delivery.
- `src/guards/guards.ts`: the delivery rules.
- `src/seat/Seat.ts`: one engine session per AI teammate; `engines.ts` knows how to
  launch each; `prompt.ts` writes the norms and the inbox text.
- `src/tools/officeMcp.ts`: `say`, `set_status`, `who_is_here`, `read_thread`.
- `src/web/`: the office page and the HTTP/SSE/MCP server.

## Known gaps

- Codex's ACP adapter rejected `session/load`, so a Codex seat starts fresh after a
  restart; Claude Code resumes. agy resume is untested.
- The fallback that posts an agent's last plain text when it forgot `say` also posts
  engine errors (seen with agy out of credits).
- No work items yet: hand-offs are messages, not owned tasks.
