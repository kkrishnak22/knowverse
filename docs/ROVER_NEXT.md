# Mission Control: next steps

Plan for continuing the Mars rover game (```` ```kv-rover ````), first on the Programming
Universe page (`content/programming/universe.md`). Written 2026-11-17.

## Where things stand

- Built: four missions that unlock the definition of programming, a predict-then-observe step
  in Mission 4, the 20-minute signal countdown, mission reports, checkpoint questions, and the
  final challenge that shows the player's Mission 4 program in Python.
- Code: `js/kit/rover.js` (UI), `js/kit/rover/missions.js` (rules, tested in
  `tests/rover.test.js`), `js/kit/rover/scene.js` (3D world), `js/kit/rover/noise.js`
  (procedural noise), `css/rover.css`. Pattern documented in `docs/ENGINEERING.md` § 3a.
- Measured: 59 fps while driving, 30 fps idle on screen, no rendering off screen. 40 tests pass.
- **Not done yet:** nothing is committed; not checked in the owner's own browser (use `?perf`);
  not checked at phone width.

## Do first tomorrow

1. Owner checks the game in their browser at `http://localhost:3000/?perf#/note/programming/universe`
   and plays all four missions. Note anything that feels slow, unclear or ugly.
2. Check phone width (Browser pane → Mobile): stage, controls, overlays, final challenge.
3. Commit the game once both checks pass.
4. Decide what to do with the robot and tea games below the rover game: they teach the same
   idea (instructions run in order). Options: keep, move further down, or remove.

## New missions (pick one per session)

Each mission teaches one new idea by making the player need it before naming it. Rules stay in
`missions.js` with tests; new commands go into the parser and simulator first, then the UI.

### 1. Black box (debugging)

- **Story:** the rover crashed overnight. Its program and telemetry log are shown.
- **Play:** scrub through the log step by step (replay on the 3D map), find the first wrong
  command, fix only that one, re-run.
- **Teaches:** debugging means finding the first step that went wrong, not starting over.
- **Build:** a timeline scrubber that replays `simulate()` steps (reusable for later missions);
  a mission field `broken: [...]` with the faulty program; report check "fixed with one change".
- **Why:** active engagement with a visualization of execution is what makes it useful
  (Sorva; Naps et al.).

### 2. Fuel budget (loops)

- **Story:** a long canyon, but the transmitter only has room for 6 commands.
- **Play:** impossible with single commands; then a `repeat(n)` card appears (block mode:
  a card that wraps other cards; code mode: `for i in range(n):` with an indented block).
- **Teaches:** loops exist so you can say "do this many times" without writing it many times.
- **Build:** nested program structure in `simulate()` (`{ cmd: 'repeat', n, body: [...] }`);
  a slot limit per mission; Python output with real `for` loops.
- **Why:** productive failure (struggle, then the tool) improved retention two weeks later in
  an introductory Python study (arXiv 2411.11227).

### 3. Dust storm (conditions)

- **Story:** the storm hides rocks until the rover's camera sees them, and the map changes
  every run.
- **Play:** a fixed program works on one run and crashes on the next. Add
  `if rock_ahead(): right()`.
- **Teaches:** programs need decisions when the world is not known in advance.
- **Build:** seeded random rock layouts per run; sensor function in the rules; show 3 runs side
  by side (or one after another) so the player sees one program meet different worlds.

### 4. Battery (variables)

- **Story:** every move drains the battery; solar tiles recharge it.
- **Play:** watch a `battery` value change as the program runs; plan a route that never hits 0.
- **Teaches:** a variable is a named value that changes while the program runs.
- **Build:** HUD meter on the stage; battery shown in the telemetry each step; Python output
  with `battery = battery - 1`.

### 5. Macro commands (functions)

- **Story:** turning around takes two commands every time.
- **Play:** save a sequence as your own command (`turn_around`) and use it.
- **Teaches:** functions name a set of steps so you can reuse them.

### 6. Two landers, one program

- **Play:** the same program runs on two rovers at different start squares.
- **Teaches:** a program is a general plan; it should work on more than one input.

## Polish backlog

- Real 3D model for the rover (glTF file) for near-photographic detail; keep the coded model
  as the fallback.
- Optional sky view: a camera angle that shows the horizon and sky.
- Remember progress (unlocked missions) in this browser so a reload resumes.
- First-run frame: one 66 ms frame at the start of the first run; warm up shaders on load.
- Accessibility: keyboard control already works for build missions; add screen-reader text
  for each rover move and the final position.

## Research behind the design

- Parsons problems (Mission 2 style): engaging, faster than writing code, similar learning —
  ITiCSE 2023 working group report.
- Productive failure in introductory Python: better retention after two weeks —
  arXiv 2411.11227.
- Predict–observe–explain (Mission 4 prediction): White and Gunstone (1992); ANU guide.
- Notional machines and program visualization: Sorva (2013).
- Player agency raised enjoyment and motivation; both versions still taught — ICEC 2024.
- Mars colours: NASA JPL natural-colour Falbreen mosaic (PIA26644); blue sunsets (sol 842).


Claude response for later

Research done. Now building, starting with the mission rules as plain, testable logic so the game can't silently break.

Rules work: all 13 tests pass and every mission is solvable. Now the 3D scene, the biggest piece: a lit Mars landscape with a detailed rover, written to the engine standards.

Scene is written. Next the mission interface around it; checking which icons the site already has first.

The shell choked on the stylesheet, so I'll write it as its own file instead, which is cleaner anyway.

Everything is wired up and all 40 tests pass. Now checking it in the browser.

The 3D scene renders with no errors. The pane is small, so I'll zoom in on the game to inspect it.

The pane is too narrow to judge the 3D detail. I'll capture the 3D view at full-HD size straight from the renderer and look at the image directly.

The first full-HD render has real lighting, dunes, rocks, a rover and a waving flag, but it still looks low-poly, so I'm fixing the faceted rocks, the harsh sand stripes, the oversized boulders near the camera, and the missing horizon.

Much better: the rocks look natural, the sand is subtle, and the plan view reads clearly. Next I'll refine the rover's wheels, then play through a mission to test the whole flow.

Now a full play-through of Mission 1: a wrong program first, then the right one, then the checkpoint.

Mission 1 works end to end: crash, retry, success, report, checkpoint and unlock. Now missions 2 to 4 and the final challenge.

The full game works, including all four missions, the countdown and the Python output. The one bug left is that leaving the page through a "not found" note doesn't shut down the 3D scene, and I'm checking why.

Cleanup now works on every route. Last check: frame rate while the rover drives, and that the scene idles when nothing moves.

The new pattern now runs at 59 fps while the rover drives and 30 fps when idle, with no rendering once you scroll past. I'm finishing the stacked-view layout polish and the documentation next.

Everything checks out. One more full-HD render of the final version to show you.

The Mars rover game is now the first thing on your Programming Universe page. It's rebuilt as a real 3D game, and I played through all four missions and the final challenge in the browser. The two renders above come straight from the game at 1920×1080. I haven't checked it in your own browser or at phone width, and nothing is committed.

## What changed from your artifact

- **Graphics:** the flat grid is now a lit 3D Mars landscape.
  - **Rover:** six wheels with tread cleats, a camera mast, an antenna dish, a power unit and gold foil. The wheels spin as it drives, and spin in opposite directions when it turns on the spot.
  - **Landscape:** dunes, craters and distant ridges, with sand ripple detail, a dusty butterscotch sky and a low sun casting long shadows.
  - **Objects:** about 500 scattered rocks, a glowing crystal sample that flies into the rover when collected, and a green flag waving in the wind.
  - **Effects:** dust trails behind the wheels, sparks and a screen shake on crashes, and a celebration burst at the flag.
- **New learning step:** Mission 4 asks you to tap where you think the rover will stop before the 20-minute signal delay, then compares that with what happened. This is the "predict, observe, explain" method from science teaching. Earth-to-Mars signal art now runs during the countdown.
- **Kept from your design:** the four missions, the definition of programming that unlocks part by part, the checkpoint questions, the final challenge and your program shown in Python at the end.
- **Changed to fit your Learn rules:**
  - **Stars:** replaced by a mission report of plain checks, since your Learn plan rules out points.
  - **Typing-text briefing:** now shows at once, because your rule says nothing plays by itself.
  - **Drag library:** no longer loaded from the internet.

## How well it runs

| Check | Result |
|---|---|
| Frame rate while the rover drives | 59 fps |
| Idle on screen | 30 fps, only for dust, flag and sample glow |
| Scrolled away or on another page | Stops completely and frees the graphics memory |
| Tests | 40 pass, including 13 new ones covering every mission rule |
| Loading cost | The 3D part only loads when the game scrolls into view |

Testing also found a bug in the documentation page: blocks weren't shut down when you landed on a "note not found" page. I fixed it.

## Things to know

- **Layout:** in the note's column the game is too narrow to sit beside the controls. So the 3D view runs full width on top, with controls and telemetry in two columns below. That breaks your "picture left, code right" rule for this block.
- **Overlap:** the robot and tea games below still teach the same idea. You may want to trim or move them later.
- **Sound:** on by default, with a toggle in the game's header.
- **Remaining look gap:** the rover is detailed but still clearly a game model. Film-level realism needs real 3D model files rather than shapes built in code; that's a possible next step.

## Ideas to grow it, based on the research

- **Black box debugging:** the rover crashed overnight; read its telemetry, find the one wrong command and fix it. *Teaches:* debugging. *Basis:* active engagement with seeing the program run beats watching it ([Sorva's work on notional machines](https://romisatriawahono.net/lecture/rm/survey/software%20engineering/Software%20Architecture/Sorva%20-%20Generic%20Program%20Visualization%20Systems%20for%20Introductory%20Programming%20-%202013.pdf)).
- **Fuel budget:** a long canyon, but only 6 command slots of fuel. It's impossible until `repeat(5)` appears. *Teaches:* loops. *Basis:* learners struggle first, then get the tool; in a [2024 study, students who learned Python this way retained more](https://arxiv.org/abs/2411.11227) two weeks later.
- **Dust storm:** the map changes each run, so a fixed program fails and the player needs "if a rock is ahead, turn". *Teaches:* conditions.
- **Battery meter:** a `battery` value that drains as the rover moves and recharges on solar tiles. *Teaches:* variables.
- **Macro commands:** save "turn around" as your own command. *Teaches:* functions.
- **Two rovers, one program:** run the same code on two landers. *Teaches:* that a program works on any input.
- **Ordering puzzles:** Mission 2's "put mixed-up steps in order" is a Parsons problem, which research finds [as effective as writing code from scratch, and faster](https://falmouth-test.eprints-hosting.org/5216/1/ITiCSE_2023_WorkingGroup_Parsons_Report.pdf). It's a good repeatable format for later lessons.

Sources:
- [Parsons Problems and Beyond: systematic review](https://acris.aalto.fi/ws/portalfiles/portal/131069230/Parsons_Problems_and_Beyond_-_Systematic_Literature_Review_and_Empirical_Study_Designs_.pdf)
- [ITiCSE 2023 Working Group report on Parsons problems](https://falmouth-test.eprints-hosting.org/5216/1/ITiCSE_2023_WorkingGroup_Parsons_Report.pdf)
- [Productive failure for introductory Python (arXiv 2411.11227)](https://arxiv.org/abs/2411.11227)
- [Player agency in educational video games (ICEC 2024)](https://icec2024.uea.edu.br/assets/files/papers/Exploring%20player%20agency%20in%20educational%20video%20games.pdf)
- [Sorva: program visualization for introductory programming](https://romisatriawahono.net/lecture/rm/survey/software%20engineering/Software%20Architecture/Sorva%20-%20Generic%20Program%20Visualization%20Systems%20for%20Introductory%20Programming%20-%202013.pdf)
- [Predict–Observe–Explain (ANU)](https://learningandteaching.anu.edu.au/resources/predict-observe-explain-activity/)
- [NASA JPL: Perseverance at Falbreen (natural-colour reference)](https://www.jpl.nasa.gov/images/pia26644-nasas-perseverance-rover-at-falbreen/)
- [NASA: Mars vista "clear as day"](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-rover-captures-mars-vista-as-clear-as-day/)
- [Blue Martian sunset (Science Times)](https://www.sciencetimes.com/articles/46440/20231009/perseverance-rover-captures-enigmatic-blue-martian-sunset-sheds-light-scattering.htm)
- [Budgeting the pretty: open-world rendering in the browser](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-05-budgeting-the-pretty)
- [100 Three.js performance tips (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Tools and techniques for procedural gamedev](https://cprimozic.net/blog/tools-and-techniques-for-procedural-gamedev/)

The temporary snapshot receiver I started for the full-HD renders has shut itself down after its 20-minute limit, as planned. It was only a testing tool and isn't part of the project.