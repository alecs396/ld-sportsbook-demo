# Demo runbook

The step-by-step script for demo day and rehearsals. Target: about 20 minutes, leaving time for questions.

## Day before

- [ ] `make doctor` is all green (0 failed).
- [ ] Rehearse the full script at least once with `make demo-reset` before it.
- [ ] Backup video of the automatic rollback is recorded and on the desktop.
- [ ] Anthropic spend limit is set; `ANTHROPIC_API_KEY` works (one test chat).
- [ ] Slack channel `#sportsbook-releases` is open in the Slack app and shows recent flag changes.
- [ ] Laptop charger, phone hotspot as a network backup.

## 30 minutes before

```bash
make up
make demo-reset
make doctor
```

- [ ] `make doctor`: 0 failed, 0 warnings.
- [ ] Browser windows, left to right:
  1. Sportsbook as a customer: http://localhost:3000?as=new-jersey-user
  2. Sportsbook as QA: http://localhost:3000?as=qa-tester
  3. Presenter panel: http://localhost:3000/presenter
  4. LaunchDarkly, **Production** environment selected, tabs open on: `live-betting` targeting, `new-bet-slip` targeting, the experiment results, `bet-assistant`
- [ ] Terminal in the repo folder, font large enough to read, **no `.env` open or on screen**.
- [ ] Slack visible or one click away.
- [ ] Notifications off (Do Not Disturb).

## The script

### 0. The story (1 min)

> A sportsbook is launching live betting before the Super Bowl. The VP of Engineering's problem: they need to ship faster than competitors, but a game-day outage is the worst possible outcome. I'll show how LaunchDarkly lets them ship dark, test in production, release by state, roll back in seconds (even automatically), and prove what works.

### 1. How it's built (2 min)

Show the architecture diagram in the README.

> Two SDKs. The server uses the secret SDK key, streams the flag rules in, and evaluates locally, so LaunchDarkly isn't in the request path. The browser uses the public client-side ID; LaunchDarkly evaluates for that one user and sends back only values. Everything runs in one container, with keys injected at runtime.

### 2. Part 1: release and remediate (6 min)

1. **Ship dark.** Point at both sportsbook windows: "Live betting is coming soon." `live-betting` targeting is off.
   > The code is deployed, but no one sees it. Deploy is not release.
2. **Test in production.** Turn `live-betting` targeting **on**. Only the QA window shows the LIVE panel, and a toast appears.
   > QA is individually targeted, so they test the real thing in production while customers see nothing new.
3. **Release.** Set the default rule to **Available (true)**. The customer window switches instantly, no reload.
   > That toast is my explicit change listener. The stream pushed the change in milliseconds.
4. **Roll back.** Turn targeting **off**. Both windows go back to the teaser.
   > Targeting off serves the off variation to everyone, QA included. It's a kill switch with no exceptions.
5. **Trigger.** Turn targeting on again, then in the terminal:
   ```bash
   make fire-trigger
   ```
   > A trigger is a secret webhook URL. Datadog or New Relic would call it when an alert fires. The change history shows why it happened. Show the Slack message.
6. **Automatic remediation.** Set the default rule to true and turn targeting on (release to all), then:
   ```bash
   make simulate-outage
   ```
   Wait for "trigger FIRED" (about 20 seconds), then Ctrl+C.
   > The simulator plays our monitoring tool: when errors cross 20%, it pulls the trigger. Live betting is off in about a second, the errors stop, and the team sees it in Slack. No human in the loop, no redeploy.

### 3. Part 2: targeting (4 min)

Use the presenter panel; the customer window follows.

1. Click **Peter**: new slip. Reason: **Individual target**.
2. Click **Cody (NJ)**: new slip. Reason: **Rule 1**.
3. Click **Sam (CA)**: classic slip. Reason: **Default rule**.
   > Each click calls identify with a new context, so every flag re-evaluates with no reload. Individual targets are checked first, then rules top to bottom, then the default rule. `name` is a private attribute: usable for targeting, never stored.
4. Talk track: segments.
   > With ten flags needing "legal states", I'd define a segment once. A new state legalizes: one change, not ten.

### 4. Experiment (3 min)

Open the experiment's results.

> Same flag as Part 2. Exposure is the flag evaluation, conversion is `track("bet-placed")`, joined by the stable context key. New slip 43.5% vs classic 25.8%, a 68% relative lift, significant. The data is simulated, and I say that up front: the point is the setup. A real test would run a full week with guardrail metrics like average stake.

### 5. AI Configs (3 min)

1. Open the bet assistant as Sam (CA) and ask "Can I bet on live games where I am?"
2. Show the `bet-assistant` config: model, parameters, prompts, `{{ ldctx.state }}`.
   > During the build the assistant invented a legal claim for California. I added a guardrail to the prompt in LaunchDarkly and the next answer changed, no deploy. The tracker records latency, tokens, success, and thumbs up/down per variation, which is how I'd pick the winning prompt.
3. Optional: edit a prompt live and ask again.

### 6. Integrations (1 min)

- `live-betting` > **Code references**: every place it's used, which is the cleanup list once it's fully released.
- Slack: the trigger-driven rollback message from step 2.

### 7. Wrap-up (1 min)

> Ship dark, test in production, release by state, roll back in seconds, automatically if needed, and measure what works. All without a deploy.

## If something breaks

| Symptom | Quick fix | If that fails |
|---|---|---|
| App won't load | `make logs`, then `make down && make up` | Show the backup video; narrate |
| Flag change doesn't show | Check LaunchDarkly is on **Production**; wait 2 seconds | Refresh the page (say "normally no reload is needed") |
| `make fire-trigger` fails | Read its message (usually `LD_TRIGGER_URL`); toggle off in the UI instead | Explain the trigger with the change history |
| `simulate-outage` doesn't fire | It needs 20 samples; wait 30 seconds | `make fire-trigger`, then show the backup video |
| Bet assistant errors | Check the config's targeting and the Anthropic console | Skip the live chat; show the config and Monitoring tab |
| LaunchDarkly UI slow or down | Wait a moment; the app keeps running on its last rules | Show the backup video; talk about fallbacks |
| Network drops | Phone hotspot | Backup video |

Whatever breaks, name it calmly and connect it to the story: "This is exactly why the app keeps working when LaunchDarkly is unreachable."

## Between rehearsals

```bash
make demo-reset
make doctor
```

`make demo-reset` restores targeting on both flags, re-enables the trigger, keeps the bet assistant at 50/50, and turns outage mode off. Clear the experiment? No: its results are part of the demo.
