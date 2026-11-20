# SHADOW AI – Intelligent Decision Simulator

SHADOW AI turns a hard decision into a structured analysis. You describe the decision and your options, and it runs a five-stage pipeline: it breaks the problem down, compares the options, simulates three possible futures for each, scores the risks, and ends with a ranked recommendation and an action plan.

It is a plain HTML, CSS and JavaScript app. There is no build step, no backend and no dependencies. It works offline with a built-in simulation engine, and it can optionally use the Claude API to write the analysis text.

## Run it

1. Put `index.html`, `style.css` and `app.js` in the same folder.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).
3. Click one of the four demo cards on the left. The full analysis runs automatically.

Offline use: the page asks Google Fonts for its typefaces. If you are offline, the browser falls back to system fonts and everything else works unchanged.

## Files

| File | Role |
|---|---|
| `index.html` | Page structure: input panel, pipeline tracker, five result cards, Claude settings dialog |
| `style.css` | Dark SHADOW AI theme, responsive layout, styles for matrix, scenarios, risks and ranking |
| `app.js` | Pipeline engine, demo data, rendering, report export, Claude integration |
| `README.md` | This document |

## How to use it

1. **Pick a demo or write your own.** Demos: job offer, SaaS launch, master's degree path, tech stack choice.
2. **Add 2 to 5 options.** Each option is a short description of a path you could take.
3. **Set your priorities.** Four sliders (low cost, speed, long-term impact, safety) from 0 to 10 control the scoring weights.
4. **Choose Run simulation.** Each stage appears as it completes, with its source (Local engine or Claude) and timing.
5. **Copy or download the report** as Markdown when the run finishes.

## The five-stage pipeline

1. **Problem decomposition and context.** Detects the domain (career, business, education, tech, finance, personal), the key themes, constraints (budgets, time frames, deadlines), the people affected, urgency and uncertainty, and lists the questions and assumptions behind the analysis.
2. **Option comparison matrix.** Each option gets pros, cons, and 1 to 10 ratings for cost, time, impact and risk. The weighted score is:
   `score = 10 × (wCost·(10 − cost) + wTime·(10 − time) + wImpact·impact + wRisk·(10 − risk))`
   where the weights are your slider values divided by their sum.
3. **Future scenarios.** Best, realistic and worst case for every option. Probabilities come from the option's risk and impact ratings. Outcome scores are the option's score plus 18, the score itself, and the score minus 32. The expected score is the probability-weighted average.
4. **Risk assessment and mitigation.** Each option gets about four risks from a domain-aware catalog plus a risk derived from its main downside. Severity is likelihood × impact (1 to 25). Each risk has a mitigation with an effectiveness percentage, and the residual severity is `severity × (1 − effectiveness)`. The option's risk exposure is the average residual severity as a percentage of 20.
5. **Ranked recommendation and action plan.** Final score:
   `0.55 × matrix score + 0.25 × expected scenario score + 0.20 × (100 − risk exposure)`
   The tool reports the winner, a confidence level based on the gap to the runner-up, a five-step action plan with timing, and a fallback option with a switch condition.

## Local engine versus demo data

- The four demos carry hand-written ratings, pros and cons so the results are realistic and repeatable.
- For your own decisions, the local engine estimates the ratings from keywords in each option (words such as "launch", "stay", "wait" or "invest") and a small deterministic variation based on the option text. The same input always gives the same result. These are heuristics, so treat them as a structured starting point and adjust your options and sliders to test how the ranking changes.

## Claude API integration (optional)

1. Choose **Claude settings** in the top bar.
2. Turn on **Use Claude for analysis**, paste your Anthropic API key, and keep or change the model name (default `claude-sonnet-4-6`).
3. Choose **Save settings**. The badge in the top bar changes to show the model.

How it works:

- Each stage sends one request to `https://api.anthropic.com/v1/messages` and asks for strict JSON.
- Claude writes the analysis (context extraction, ratings, pros and cons, scenario texts, risks and mitigations, the rationale and the action plan).
- The ranking, weighted scores and risk arithmetic always stay local, so the final ranking is reproducible and cannot be changed by a malformed reply.
- If a request fails or returns invalid data, that stage falls back to the local engine and a message explains why.

Key handling and security:

- The key lives only in this tab's memory. It is not written to storage and is lost when you reload the page.
- Requests go from your browser directly to Anthropic with the header `anthropic-dangerous-direct-browser-access`, which is required for browser calls. This is fine for a local demo or a course project. For a public deployment, move the call to a small server so the key is never exposed to visitors.

## Testing checklist

- Click each of the four demos and confirm all five pipeline steps turn green.
- Change a slider (for example set speed to 10 and cost to 0) and run again. The ranking should shift.
- Enter a custom decision with two options and run it.
- Switch tabs in the scenarios card to see each option's three futures.
- Download the report and open it in a Markdown viewer.
- Resize the window below 980 px and below 560 px to check the responsive layout.
- Enable Claude with an invalid key to confirm the local engine takes over with a clear message.

## Extending the project

- Add a demo: add an entry to the `DEMOS` object in `app.js` and a matching card in `index.html` with `data-scenario`.
- Add a domain: extend `DOMAINS`, `SUBQ` and `RISKS` in `app.js`.
- Change the scoring: edit `weightedScore` (stage 2) and the weights in `localRecommend` (stage 5).
- Add a stage: add a local function, a Claude function in `claudeStages`, a render function, and a result card plus a pipeline step in `index.html`.

## Limitations

- Scores are estimates from a simulation model, not predictions. They help you structure a choice, not make it for you.
- The local engine does not understand free text beyond keywords. Use the Claude option for deeper context.
- For decisions about health, legal or major financial matters, consult a qualified professional.
