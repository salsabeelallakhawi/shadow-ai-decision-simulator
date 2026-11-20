/* SHADOW AI – Intelligent Decision Simulator
 * Five-stage pipeline: decompose -> compare -> simulate -> assess risk -> recommend.
 * Runs fully offline with a local heuristic engine. Optionally, Claude writes the
 * analysis text for each stage; scoring and ranking always stay deterministic and local.
 */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const round1 = n => Math.round(n * 10) / 10;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lc = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
  const jitter = (seed, k) => (hash(seed + '|' + k) % 3) - 1;
  const toList = (v, fb) => (Array.isArray(v) && v.length ? v.map(x => String(x)).slice(0, 8) : fb);
  const num = (v, lo, hi, fb) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? clamp(Number(v), lo, hi) : fb);
  const str = (v, fb) => (typeof v === 'string' && v.trim() ? v.trim() : fb);

  /* ---------- demo scenarios ---------- */
  const o = (name, cost, time, impact, risk, costLabel, timeLabel, pros, cons) =>
    ({ name, cost, time, impact, risk, costLabel, timeLabel, pros, cons });

  const DEMOS = {
    career: {
      title: 'Should I accept the remote job offer from a fast-growing startup?',
      context: 'I have worked three years at a stable company with a modest salary. A startup offered me a 30% raise, remote work and a senior title, but the contract is only 12 months and the funding round closes soon. I must answer within 10 days. My family depends on my income and I am worried about job security.',
      weights: { cost: 4, time: 5, impact: 8, risk: 7 },
      options: [
        o('Accept the startup offer', 3, 3, 9, 7, 'Low (notice period only)', '1–2 months to transition',
          ['30% higher salary and senior title', 'Remote work saves commute time and cost', 'Faster skill growth and visibility'],
          ['12-month contract with no guaranteed renewal', 'Funding round may fall through', 'Lose seniority and benefits at current company']),
        o('Stay and negotiate a raise', 2, 4, 6, 3, 'Very low', '2–4 weeks',
          ['Keeps income and benefits stable', 'Offer gives leverage in negotiation', 'No relocation of habits or team'],
          ['Raise may be smaller than 30%', 'Growth ceiling stays the same', 'Employer may question loyalty']),
        o('Decline and keep searching', 5, 8, 7, 5, 'Medium (search time and lost income)', '3–6 months',
          ['Time to find a better-matched role', 'Keeps current job meanwhile', 'Builds a wider set of options'],
          ['Searching while employed is slow and tiring', 'Good offers expire quickly', 'Opportunity cost of the current offer'])
      ]
    },
    startup: {
      title: 'How should I launch my SaaS startup idea?',
      context: 'I have a validated problem and a prototype for a scheduling tool for small clinics. I have 8 months of savings, no investors yet and a full-time job. Two clinics said they would pay if the product works. I want to avoid burning out or losing all my savings.',
      weights: { cost: 6, time: 6, impact: 8, risk: 7 },
      options: [
        o('Quit and launch full-time', 7, 5, 9, 9, 'High (savings used as salary)', '6–9 months to revenue',
          ['Maximum speed and focus', 'Can serve early customers immediately', 'Strong signal to future investors'],
          ['Savings run out in 8 months', 'Heavy personal and family pressure', 'Hard to return to the same job']),
        o('Build part-time while employed', 3, 8, 7, 3, 'Low', '10–14 months to revenue',
          ['Salary protects savings', 'Time to validate with the two clinics', 'Easy to stop if demand is weak'],
          ['Slow progress and risk of burnout', 'Employment contract may limit side work', 'Competitors may move faster']),
        o('Seek seed funding first', 5, 7, 8, 6, 'Medium (fundraising effort)', '4–8 months to close',
          ['External capital funds a team', 'Investors bring network and advice', 'Reduces personal financial exposure'],
          ['Dilution and loss of control', 'Most pitches fail without traction', 'Fundraising distracts from the product'])
      ]
    },
    study: {
      title: 'Which path should I take after my engineering degree?',
      context: 'I will graduate next year with good grades. I want a career in AI. I received admission to a master\'s programme abroad, but tuition and living costs are very high and I would need a scholarship. I could also study locally part-time or start working first. I also want to support my family.',
      weights: { cost: 7, time: 5, impact: 8, risk: 5 },
      options: [
        o('Master\'s abroad with scholarship', 9, 8, 9, 7, 'Very high (without full funding)', '2 years',
          ['Top-tier research exposure and network', 'Strong international career prospects', 'Access to advanced AI labs'],
          ['Scholarship is not guaranteed', 'High living cost and visa uncertainty', 'Two years without family income']),
        o('Local master\'s, part-time', 3, 7, 6, 3, 'Low', '3 years',
          ['Keeps income and family support', 'Low tuition and no relocation', 'Can apply learning at work immediately'],
          ['Smaller research ecosystem', 'Long timeline with split attention', 'Fewer international connections']),
        o('Work in AI for 2 years first', 2, 5, 7, 4, 'Very low (earn while learning)', '2 years',
          ['Real project experience and income', 'Clarifies which specialisation to study', 'Stronger future applications'],
          ['Admission offer may expire', 'Harder to return to study later', 'Early roles may be narrow'])
      ]
    },
    tech: {
      title: 'Which technology stack should we use for our new product MVP?',
      context: 'Our team has three developers: two strong in JavaScript and one in Python. We need a working MVP in 12 weeks with limited budget. The product needs user accounts, a dashboard and some machine learning features. We expect to grow quickly if the MVP works.',
      weights: { cost: 5, time: 8, impact: 6, risk: 6 },
      options: [
        o('Next.js with Node.js backend', 3, 4, 8, 4, 'Low', '8–10 weeks',
          ['Two developers already fluent', 'One language across the stack', 'Large hiring pool and ecosystem'],
          ['ML features need a separate Python service', 'Fast-moving framework versions', 'Needs discipline to keep code structured']),
        o('Django backend with React frontend', 4, 5, 8, 4, 'Low to medium', '10–12 weeks',
          ['Python makes ML integration natural', 'Built-in auth and admin panel', 'Mature, stable framework'],
          ['Two languages to maintain', 'Only one developer is expert in Python', 'Slightly slower UI iteration']),
        o('No-code MVP first, rebuild later', 2, 2, 5, 6, 'Very low', '3–4 weeks',
          ['Fastest path to user feedback', 'Almost no engineering cost', 'Validates demand before investing'],
          ['Hard limits on custom ML features', 'Rebuild cost later', 'Vendor lock-in and scaling limits'])
      ]
    }
  };

  /* ---------- lexicons ---------- */
  const DOMAINS = {
    career: ['job', 'career', 'offer', 'salary', 'manager', 'promotion', 'role', 'hire', 'remote', 'employer'],
    business: ['startup', 'business', 'customer', 'revenue', 'launch', 'founder', 'product', 'market', 'fundrais', 'saas'],
    education: ['study', 'degree', 'master', 'university', 'course', 'phd', 'scholarship', 'graduate', 'abroad', 'learn'],
    tech: ['stack', 'framework', 'code', 'software', 'database', 'api', 'cloud', 'backend', 'frontend', 'mvp'],
    finance: ['money', 'loan', 'mortgage', 'savings', 'budget', 'rent', 'debt', 'price', 'stock', 'invest'],
    personal: ['family', 'move', 'city', 'relationship', 'health', 'house', 'friend', 'life']
  };
  const STOP = new Set('the and for that with this have from about will would could should what which when where into your they them their there been being more most than then also just like some only over very much many want need make take does doing done are was were has had but not you our out can may might who how why its his her she him'.split(' '));
  const STAKE = { family: 'Family', parents: 'Parents', wife: 'Spouse', husband: 'Spouse', spouse: 'Spouse', partner: 'Partner', kids: 'Children', children: 'Children', team: 'Team', manager: 'Manager', boss: 'Manager', investor: 'Investors', cofounder: 'Co-founder', customer: 'Customers', clinic: 'Customers', friend: 'Friends', developer: 'Developers' };
  const SUBQ = {
    career: 'How does each option change income, security and growth over 24 months?',
    business: 'What evidence of demand exists, and how long can the venture survive without revenue?',
    education: 'Which path gives the strongest skills and network per unit of cost and time?',
    tech: 'Which choice fits the team\'s skills while keeping the product able to scale?',
    finance: 'What is the total cost over time, including the cost of being wrong?',
    personal: 'How does each option affect the people and routines that matter most?',
    general: 'What outcome would make this decision look right in two years?'
  };
  const LEX = {
    riskUp: ['new', 'launch', 'quit', 'start', 'move', 'invest', 'abroad', 'leave', 'switch', 'all-in', 'buy', 'change', 'full-time', 'accept'],
    riskDown: ['stay', 'keep', 'wait', 'negotiate', 'test', 'pilot', 'part-time', 'gradual', 'save', 'first', 'later'],
    costUp: ['buy', 'invest', 'abroad', 'hire', 'build', 'launch', 'relocate', 'premium', 'quit', 'full-time'],
    costDown: ['free', 'stay', 'keep', 'delay', 'wait', 'learn', 'reuse', 'negotiate', 'part-time'],
    timeUp: ['build', 'degree', 'master', 'learn', 'develop', 'relocate', 'long', 'train', 'search', 'part-time'],
    timeDown: ['quick', 'now', 'accept', 'buy', 'use', 'existing', 'negotiate', 'immediately'],
    impactUp: ['new', 'launch', 'grow', 'scale', 'invest', 'expand', 'master', 'lead', 'accept', 'full-time'],
    impactDown: ['stay', 'keep', 'wait', 'delay', 'nothing', 'decline', 'postpone']
  };
  const RISKS = {
    general: [
      ['Key facts turn out different from your assumptions', 3, 3, 'Validate the top three assumptions with a quick test or an expert conversation before committing', 60],
      ['Cost overrun beyond the planned budget', 3, 4, 'Set a hard spending cap and review it at fixed checkpoints', 55],
      ['Timeline slips because of dependencies you do not control', 3, 3, 'Add a 25% time buffer and remove one hard dependency early', 50],
      ['Loss of motivation or support from the people involved', 2, 4, 'Agree on expectations early and schedule regular check-ins', 45],
      ['Hard to undo if it goes wrong', 2, 5, 'Break the move into reversible stages with a clear exit condition', 65]
    ],
    career: [
      ['Culture or manager mismatch discovered after joining', 3, 4, 'Speak to two current team members and negotiate a probation exit clause', 55],
      ['Employer instability or a funding shortfall', 2, 5, 'Check the runway and keep three months of living costs saved', 60]
    ],
    business: [
      ['Weak customer demand for the offer', 3, 5, 'Pre-sell to ten customers before building more', 65],
      ['Cash runs out before revenue arrives', 3, 5, 'Track monthly burn and keep a six-month runway', 60]
    ],
    education: [
      ['Funding gap or hidden living costs', 3, 4, 'Apply for two scholarships and budget a 20% contingency', 55],
      ['Programme does not improve job prospects', 2, 4, 'Check graduate outcomes and ask alumni before enrolling', 50]
    ],
    tech: [
      ['Technology choice limits scaling or hiring later', 2, 4, 'Isolate the core logic behind clear interfaces and run a spike test', 60],
      ['Team lacks experience with the chosen tools', 3, 3, 'Budget learning time and start with a thin vertical slice', 55]
    ],
    finance: [
      ['Market or interest-rate shift changes the economics', 3, 4, 'Stress-test the numbers at a pessimistic rate', 55],
      ['Liquidity squeeze from a large commitment', 2, 5, 'Keep an emergency fund separate from the commitment', 65]
    ],
    personal: [
      ['Relationships or daily routine suffer from the change', 3, 4, 'Discuss the trade-offs with those affected and trial the change if possible', 50],
      ['Adaptation takes longer than expected', 3, 3, 'Plan a gradual transition with a support network', 50]
    ]
  };
  const CRITERIA = { cost: 'low cost', time: 'speed', impact: 'long-term impact', risk: 'safety' };

  /* ---------- state ---------- */
  const state = {
    running: false,
    demo: null,
    result: null,
    settings: { useClaude: false, apiKey: '', model: 'claude-sonnet-4-6' }
  };

  /* ---------- input handling ---------- */
  const optionsList = $('#options-list');

  function addOptionRow(value = '') {
    if ($$('.option-row', optionsList).length >= 5) { toast('You can compare up to 5 options.'); return; }
    const li = document.createElement('li');
    li.className = 'option-row';
    li.innerHTML = '<input type="text" class="option-input" maxlength="90" placeholder="Describe an option" autocomplete="off" aria-label="Option">' +
      '<button type="button" class="icon-btn" aria-label="Remove option">\u00d7</button>';
    $('input', li).value = value;
    $('button', li).addEventListener('click', () => { li.remove(); syncRemoveButtons(); });
    optionsList.appendChild(li);
    syncRemoveButtons();
  }

  function syncRemoveButtons() {
    const rows = $$('.option-row', optionsList);
    rows.forEach((r, i) => { $('button', r).disabled = rows.length <= 2; $('input', r).setAttribute('aria-label', 'Option ' + (i + 1)); });
    $('#add-option').disabled = rows.length >= 5;
  }

  function setOptions(names) {
    optionsList.innerHTML = '';
    names.forEach(n => addOptionRow(n));
    while ($$('.option-row', optionsList).length < 2) addOptionRow('');
  }

  function setWeights(w) {
    $$('input[type="range"]').forEach(r => {
      const v = w[r.dataset.weight];
      if (v !== undefined) { r.value = v; r.nextElementSibling.textContent = v; }
    });
  }

  function readInput() {
    const names = $$('.option-input', optionsList).map(i => i.value.trim()).filter(Boolean);
    const weights = {};
    $$('input[type="range"]').forEach(r => { weights[r.dataset.weight] = Number(r.value); });
    return { title: $('#decision-title').value.trim(), context: $('#decision-context').value.trim(), names, weights };
  }

  function validate(inp) {
    if (inp.title.length < 5) return 'Enter the decision you are facing (at least 5 characters).';
    const uniq = new Set(inp.names.map(n => n.toLowerCase()));
    if (inp.names.length < 2 || uniq.size < inp.names.length) return 'Enter at least two different options to compare.';
    return '';
  }

  /* ---------- stage 1: decomposition (local) ---------- */
  function localDecompose(inp) {
    const text = (inp.title + ' ' + inp.context + ' ' + inp.names.join(' ')).toLowerCase();
    let domain = 'general', best = 0;
    Object.entries(DOMAINS).forEach(([d, words]) => {
      const c = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
      if (c > best) { best = c; domain = d; }
    });
    const freq = {};
    (text.match(/[a-z][a-z-]{3,}/g) || []).forEach(w => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 7).map(e => e[0]);

    const constraints = [];
    const money = text.match(/(\$|usd|€|₪)\s?\d[\d,.]*\s?k?|\d[\d,.]*\s?(usd|dollars|k\b)/gi);
    if (money) constraints.push('Budget figures mentioned: ' + [...new Set(money.map(m => m.trim()))].slice(0, 3).join(', '));
    const spans = text.match(/\d+\s?(day|week|month|year)s?/gi);
    if (spans) constraints.push('Time frames mentioned: ' + [...new Set(spans)].slice(0, 3).join(', '));
    if (/\b(deadline|within|before|until|expires|by the end)\b/.test(text)) constraints.push('The decision is time-bound');
    if (/\b(savings|runway|income|salary|afford)\b/.test(text)) constraints.push('Personal finances limit how much risk is acceptable');
    if (!constraints.length) constraints.push('No explicit constraints stated, so a moderate budget and a flexible timeline are assumed');

    const stakeholders = ['You (primary decision maker)'];
    Object.entries(STAKE).forEach(([k, v]) => { if (text.includes(k) && !stakeholders.includes(v)) stakeholders.push(v); });

    const level = (re, hi, mid) => { const c = (text.match(re) || []).length; return c >= hi ? 'high' : c >= mid ? 'medium' : 'low'; };
    const urgency = level(/urgent|asap|deadline|immediately|soon|expires|within|days/g, 3, 1);
    const uncertainty = level(/unsure|not sure|uncertain|worried|afraid|risk|maybe|unknown|don't know|fear|may |might /g, 3, 1);

    return {
      domain,
      coreQuestion: 'Which option best serves the goal behind "' + inp.title.replace(/\?+$/, '') + '" under the stated constraints?',
      keywords, constraints, stakeholders, urgency, uncertainty,
      subQuestions: [
        SUBQ[domain],
        'What is the cost of being wrong, and can the choice be reversed?',
        'Which assumption, if false, would change the ranking?'
      ],
      assumptions: [
        'The facts in your description are accurate and complete',
        'Your priorities (the four sliders) stay stable over the decision period',
        'Options are mutually exclusive: you pick one as the main path'
      ]
    };
  }

  /* ---------- stage 2: comparison matrix ---------- */
  function estimate(name, ctx) {
    const nm = name.toLowerCase();
    const score = list => list.reduce((n, w) => n + (nm.includes(w) ? 1 : 0), 0);
    const attr = (base, up, down, k) => clamp(base + score(LEX[up]) * 1.5 - score(LEX[down]) * 1.5 + jitter(name, k), 1, 10);
    const cost = attr(5, 'costUp', 'costDown', 'c');
    const time = attr(5, 'timeUp', 'timeDown', 't');
    const impact = attr(5, 'impactUp', 'impactDown', 'i');
    let risk = attr(5, 'riskUp', 'riskDown', 'r');
    risk = clamp(Math.round((risk * 2 + (impact > 7 ? 7 : 5)) / 3), 1, 10);
    const lvl = n => (n <= 3 ? 'Low' : n <= 6 ? 'Medium' : 'High');
    const pros = [], cons = [];
    if (cost <= 4) pros.push('Low upfront cost'); else if (cost >= 7) cons.push('High financial commitment');
    if (time <= 4) pros.push('Delivers results quickly'); else if (time >= 7) cons.push('Takes a long time to pay off');
    if (impact >= 7) pros.push('High long-term upside'); else if (impact <= 4) cons.push('Limited long-term upside');
    if (risk <= 4) pros.push('Easy to reverse or adjust'); else if (risk >= 7) cons.push('Hard to undo if it goes wrong');
    if (!pros.length) pros.push('Balanced trade-offs across cost, time and impact');
    if (!cons.length) cons.push('Benefits depend on assumptions that are not yet verified');
    if (pros.length < 2) pros.push('Clear first step that can be started now');
    if (cons.length < 2) cons.push('Needs regular review to stay on track');
    return { name, cost, time, impact, risk, costLabel: lvl(cost), timeLabel: lvl(time).toLowerCase() + ' time investment', pros, cons };
  }

  function normWeights(w) {
    const sum = w.cost + w.time + w.impact + w.risk;
    if (sum === 0) return { cost: 0.25, time: 0.25, impact: 0.25, risk: 0.25 };
    return { cost: w.cost / sum, time: w.time / sum, impact: w.impact / sum, risk: w.risk / sum };
  }

  function weightedScore(opt, nw) {
    return round1(10 * (nw.cost * (10 - opt.cost) + nw.time * (10 - opt.time) + nw.impact * opt.impact + nw.risk * (10 - opt.risk)));
  }

  function localCompare(inp) {
    const demoData = state.demo ? DEMOS[state.demo].options : [];
    const nw = normWeights(inp.weights);
    const options = inp.names.map(n => {
      const found = demoData.find(d => d.name.toLowerCase() === n.toLowerCase());
      return found ? { ...found, pros: found.pros.slice(), cons: found.cons.slice() } : estimate(n, inp.context);
    });
    options.forEach(op => { op.score = weightedScore(op, nw); });
    return { options, nw };
  }

  /* ---------- stage 3: scenarios ---------- */
  function localScenarios(cmp) {
    return cmp.options.map(op => {
      const p = op.pros, c = op.cons;
      const worstP = clamp(Math.round(8 + op.risk * 3.2), 10, 45);
      const bestP = clamp(Math.round(10 + op.impact * 2 - op.risk * 0.8), 10, 40);
      const realP = 100 - worstP - bestP;
      const bv = Math.min(100, op.score + 18), rv = op.score, wv = Math.max(0, op.score - 32);
      return {
        name: op.name,
        best: { p: bestP, value: round1(bv), text: op.name + ' plays out well: ' + lc(p[0]) + (p[1] ? ' and ' + lc(p[1]) : '') + '. Early wins build confidence and open further options.' },
        realistic: { p: realP, value: round1(rv), text: op.name + ' works with trade-offs: ' + lc(p[0]) + ' is real, but ' + lc(c[0]) + ' slows progress. Expect a steady result over a ' + lc(op.timeLabel) + ' that needs regular adjustment.' },
        worst: { p: worstP, value: round1(wv), text: lc(c[0]).replace(/^./, ch => ch.toUpperCase()) + (c[1] ? ' and ' + lc(c[1]) : '') + ' turn out worse than planned. Costs (' + lc(op.costLabel) + ') overrun and you need an exit plan to limit the damage.' },
        expected: round1((bestP * bv + realP * rv + worstP * wv) / 100)
      };
    });
  }

  /* ---------- stage 4: risk assessment ---------- */
  function buildRisk(opt, title, l, i, mitigation, eff) {
    const severity = l * i;
    return { title, likelihood: l, impact: i, severity, mitigation, effectiveness: eff, residual: round1(severity * (1 - eff / 100)) };
  }

  function summarizeRisk(list) {
    const mean = list.reduce((n, r) => n + r.residual, 0) / (list.length || 1);
    return round1(clamp((mean / 20) * 100, 0, 100));
  }

  function localRisk(inp, cmp, dec) {
    const pool = (RISKS[dec.domain] || []).concat(RISKS.general);
    return cmp.options.map(op => {
      const picked = pool.map(r => ({ r, k: hash(op.name + r[0]) })).sort((a, b) => a.k - b.k).slice(0, 3).map(x => x.r);
      const risks = picked.map(r => buildRisk(op, r[0], clamp(Math.round(r[1] + (op.risk - 5) / 3), 1, 5), r[2], r[3], r[4]));
      risks.push(buildRisk(op, 'Downside: ' + lc(op.cons[0]), clamp(Math.round(op.risk / 2.2), 1, 5), op.risk > 6 ? 4 : 3,
        'Plan a specific response before committing and set an early warning signal', 50));
      risks.sort((a, b) => b.severity - a.severity);
      return { name: op.name, risks, exposure: summarizeRisk(risks) };
    });
  }

  /* ---------- stage 5: ranked recommendation ---------- */
  function localRecommend(inp, dec, cmp, scn, rsk) {
    const ranked = cmp.options.map((op, idx) => {
      const exposure = rsk[idx].exposure;
      const final = round1(0.55 * op.score + 0.25 * scn[idx].expected + 0.2 * (100 - exposure));
      return { idx, name: op.name, final, matrix: op.score, expected: scn[idx].expected, exposure, op };
    }).sort((a, b) => b.final - a.final);
    const w = ranked[0], r2 = ranked[1];
    const gap = round1(w.final - r2.final);
    const confidence = Math.round(clamp(55 + gap * 2.2, 50, 95));

    const nw = cmp.nw;
    const diffs = {
      cost: nw.cost * ((10 - w.op.cost) - (10 - r2.op.cost)),
      time: nw.time * ((10 - w.op.time) - (10 - r2.op.time)),
      impact: nw.impact * (w.op.impact - r2.op.impact),
      risk: nw.risk * ((10 - w.op.risk) - (10 - r2.op.risk))
    };
    const edge = Object.entries(diffs).sort((a, b) => b[1] - a[1])[0][0];
    const topRisk = rsk[w.idx].risks[0];
    const others = dec.stakeholders.slice(1, 3);

    return {
      ranked, confidence, gap,
      headline: 'Choose "' + w.name + '"',
      rationale: '"' + w.name + '" scores ' + w.final + '/100, ' + gap + ' points ahead of "' + r2.name + '". Its edge comes mainly from ' + CRITERIA[edge] +
        ', which you weighted ' + (inp.weights[edge] >= 6 ? 'highly' : 'moderately') + '. Its residual risk exposure is ' + w.exposure + '% after mitigation, and the realistic scenario scores ' + scn[w.idx].realistic.value + '.',
      plan: [
        { when: 'Days 1\u20133', action: 'Write down your decision criteria and confirm "' + w.name + '" with ' + (others.length ? others.join(' and ') : 'the people affected') + '.' },
        { when: 'Week 1\u20132', action: 'Validate the biggest weakness first: ' + lc(topRisk.title) + '.' },
        { when: 'Month 1', action: 'Start executing and capture the main benefit: ' + lc(w.op.pros[0]) + '. Aim for a first visible milestone within a ' + lc(w.op.timeLabel) + '.' },
        { when: 'Month 2\u20133', action: 'Apply the mitigation: ' + lc(topRisk.mitigation) + '.' },
        { when: 'Checkpoint', action: 'Compare real results with the realistic scenario. If they drift toward the worst case, switch to "' + r2.name + '".' }
      ],
      fallback: 'Keep "' + r2.name + '" as the fallback (' + r2.final + '/100). Switch if the top risk materialises and the mitigation does not work within the first checkpoint.'
    };
  }

  /* ---------- Claude integration ---------- */
  const SYSTEM = 'You are SHADOW AI, a rigorous decision-analysis engine. Reply with ONLY one valid JSON object that follows the requested schema. No markdown, no code fences, no commentary. Be specific to the user\'s situation, concise and realistic. Use the option names exactly as given.';

  async function callClaude(task, schema, payload) {
    const { apiKey, model } = state.settings;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model, max_tokens: 1800, system: SYSTEM,
        messages: [{ role: 'user', content: task + '\n\nSchema:\n' + schema + '\n\nInput:\n' + JSON.stringify(payload) }]
      })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error.message; } catch (e) { detail = res.statusText; }
      throw new Error('API ' + res.status + ': ' + detail);
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('Claude returned no JSON.');
    return JSON.parse(clean.slice(start, end + 1));
  }

  const byName = (arr, name) => (Array.isArray(arr) ? arr.find(x => x && String(x.name).toLowerCase() === name.toLowerCase()) : null);
  const brief = inp => ({ decision: inp.title, context: inp.context, options: inp.names, priorities_0_to_10: inp.weights });

  const claudeStages = {
    async 1(inp, local) {
      const r = await callClaude('Stage 1: decompose the decision and extract context.',
        '{"domain":"career|business|education|tech|finance|personal|general","coreQuestion":string,"keywords":[string],"constraints":[string],"stakeholders":[string],"subQuestions":[string],"assumptions":[string],"urgency":"low|medium|high","uncertainty":"low|medium|high"}', brief(inp));
      const lvl = (v, fb) => (['low', 'medium', 'high'].includes(v) ? v : fb);
      return {
        domain: Object.keys(RISKS).includes(r.domain) ? r.domain : local.domain,
        coreQuestion: str(r.coreQuestion, local.coreQuestion),
        keywords: toList(r.keywords, local.keywords), constraints: toList(r.constraints, local.constraints),
        stakeholders: toList(r.stakeholders, local.stakeholders), subQuestions: toList(r.subQuestions, local.subQuestions),
        assumptions: toList(r.assumptions, local.assumptions),
        urgency: lvl(r.urgency, local.urgency), uncertainty: lvl(r.uncertainty, local.uncertainty)
      };
    },
    async 2(inp, local, ctx) {
      const r = await callClaude('Stage 2: build the option comparison matrix. cost, time and risk use 1-10 where 10 is worst (most costly, slowest, riskiest); impact uses 1-10 where 10 is best.',
        '{"options":[{"name":string,"cost":number,"time":number,"impact":number,"risk":number,"costLabel":string,"timeLabel":string,"pros":[string],"cons":[string]}]}',
        { ...brief(inp), analysis: ctx.dec });
      const options = local.options.map(lo => {
        const c = byName(r.options, lo.name);
        if (!c) return lo;
        return {
          name: lo.name, cost: num(c.cost, 1, 10, lo.cost), time: num(c.time, 1, 10, lo.time), impact: num(c.impact, 1, 10, lo.impact), risk: num(c.risk, 1, 10, lo.risk),
          costLabel: str(c.costLabel, lo.costLabel), timeLabel: str(c.timeLabel, lo.timeLabel), pros: toList(c.pros, lo.pros), cons: toList(c.cons, lo.cons)
        };
      });
      options.forEach(op => { op.score = weightedScore(op, local.nw); });
      return { options, nw: local.nw };
    },
    async 3(inp, local, ctx) {
      const r = await callClaude('Stage 3: write best-case, realistic and worst-case futures (2 sentences each) for every option.',
        '{"options":[{"name":string,"best":string,"realistic":string,"worst":string}]}',
        { ...brief(inp), matrix: ctx.cmp.options.map(o2 => ({ name: o2.name, pros: o2.pros, cons: o2.cons, cost: o2.costLabel, time: o2.timeLabel })) });
      return local.map(s => {
        const c = byName(r.options, s.name);
        if (!c) return s;
        return { ...s, best: { ...s.best, text: str(c.best, s.best.text) }, realistic: { ...s.realistic, text: str(c.realistic, s.realistic.text) }, worst: { ...s.worst, text: str(c.worst, s.worst.text) } };
      });
    },
    async 4(inp, local, ctx) {
      const r = await callClaude('Stage 4: list the 3 to 4 most important risks per option with likelihood (1-5), impact (1-5), a concrete mitigation and its effectiveness (0-100).',
        '{"options":[{"name":string,"risks":[{"title":string,"likelihood":number,"impact":number,"mitigation":string,"effectiveness":number}]}]}',
        { ...brief(inp), scenarios: ctx.scn.map(s => ({ name: s.name, worst: s.worst.text })) });
      return local.map(lr => {
        const c = byName(r.options, lr.name);
        if (!c || !Array.isArray(c.risks) || !c.risks.length) return lr;
        const risks = c.risks.slice(0, 5).map(x => buildRisk(null, str(x.title, 'Unnamed risk'), Math.round(num(x.likelihood, 1, 5, 3)), Math.round(num(x.impact, 1, 5, 3)), str(x.mitigation, 'Define a response plan'), num(x.effectiveness, 0, 95, 50)));
        risks.sort((a, b) => b.severity - a.severity);
        return { name: lr.name, risks, exposure: summarizeRisk(risks) };
      });
    },
    async 5(inp, local, ctx) {
      const r = await callClaude('Stage 5: write the final recommendation. The ranking is already computed; explain it and give a 5-step action plan with timing.',
        '{"headline":string,"rationale":string,"plan":[{"when":string,"action":string}],"fallback":string}',
        { ...brief(inp), ranking: local.ranked.map(x => ({ name: x.name, score: x.final, residualRiskPct: x.exposure })), topRisks: ctx.rsk[local.ranked[0].idx].risks.slice(0, 2).map(x => x.title) });
      const plan = Array.isArray(r.plan) ? r.plan.filter(p => p && p.action).slice(0, 7).map(p => ({ when: str(p.when, 'Next'), action: String(p.action) })) : [];
      return { ...local, headline: str(r.headline, local.headline), rationale: str(r.rationale, local.rationale), plan: plan.length >= 3 ? plan : local.plan, fallback: str(r.fallback, local.fallback) };
    }
  };

  /* ---------- rendering ---------- */
  const bar = (pct, cls = '') => '<div class="score-bar ' + cls + '"><i style="width:' + clamp(pct, 0, 100) + '%"></i></div>';
  const ul = items => '<ul class="bullets">' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
  const chips = (items, cls = '') => '<div class="chips">' + items.map(i => '<span class="chip ' + cls + '">' + esc(i) + '</span>').join('') + '</div>';

  function renderDecomp(d) {
    return '<p><strong>' + esc(d.coreQuestion) + '</strong></p>' +
      '<dl class="kv-grid" style="margin:0">' +
      '<div class="kv"><dt>Domain</dt><dd>' + esc(d.domain) + '</dd></div>' +
      '<div class="kv"><dt>Urgency</dt><dd>' + esc(d.urgency) + '</dd></div>' +
      '<div class="kv"><dt>Uncertainty</dt><dd>' + esc(d.uncertainty) + '</dd></div></dl>' +
      '<div><h4>Key themes</h4>' + chips(d.keywords) + '</div>' +
      '<div><h4>Constraints</h4>' + ul(d.constraints) + '</div>' +
      '<div><h4>People affected</h4>' + chips(d.stakeholders, 'warm') + '</div>' +
      '<div><h4>Questions to answer</h4>' + ul(d.subQuestions) + '</div>' +
      '<div><h4>Working assumptions</h4>' + ul(d.assumptions) + '</div>';
  }

  function renderMatrix(cmp) {
    const top = Math.max(...cmp.options.map(o2 => o2.score));
    const rows = cmp.options.map(op => '<tr class="' + (op.score === top ? 'is-top' : '') + '"><th scope="row">' + esc(op.name) + '</th>' +
      '<td>' + ul2(op.pros) + '</td><td>' + ul2(op.cons) + '</td>' +
      '<td class="num">' + esc(op.costLabel) + bar(op.cost * 10, 'warm') + '</td>' +
      '<td class="num">' + esc(op.timeLabel) + bar(op.time * 10, 'warm') + '</td>' +
      '<td class="num">' + op.impact + '/10' + bar(op.impact * 10) + '</td>' +
      '<td class="num">' + op.risk + '/10' + bar(op.risk * 10, 'danger') + '</td>' +
      '<td class="num">' + op.score + bar(op.score) + '</td></tr>').join('');
    return '<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Option</th><th>Pros</th><th>Cons</th><th>Cost</th><th>Time</th><th>Impact</th><th>Risk</th><th>Weighted score</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="hint">Scores weigh cost, time, impact and risk by your sliders. For cost, time and risk a shorter bar is better; for impact and score a longer bar is better.</p>';
  }
  const ul2 = items => '<ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';

  function renderScenarios(scn, active = 0) {
    const s = scn[active];
    const card = (cls, label, sc) => '<div class="scenario ' + cls + '"><h4>' + label + '</h4><div class="prob"><b>' + sc.p + '%</b> likelihood</div><p>' + esc(sc.text) + '</p><div class="prob">Outcome score <b>' + sc.value + '</b>/100</div>' + bar(sc.value) + '</div>';
    return '<div class="scenario-tabs" role="tablist" aria-label="Options">' +
      scn.map((x, i) => '<button type="button" class="scenario-tab" role="tab" data-i="' + i + '" aria-selected="' + (i === active) + '">' + esc(x.name) + '</button>').join('') + '</div>' +
      '<div class="scenario-grid">' + card('best', 'Best case', s.best) + card('real', 'Realistic case', s.realistic) + card('worst', 'Worst case', s.worst) + '</div>' +
      '<p class="hint">Probability-weighted expected score for this option: <strong>' + s.expected + '/100</strong>.</p>';
  }

  function renderRisk(rsk) {
    return rsk.map(r => '<div><h4>' + esc(r.name) + ' \u2013 residual exposure ' + r.exposure + '%</h4><div class="risk-list">' +
      r.risks.map(x => {
        const sev = x.severity >= 15 ? 'high' : x.severity >= 8 ? 'mid' : 'low';
        return '<div class="risk-item sev-' + sev + '"><div><h4>' + esc(x.title) + '</h4><p>Likelihood ' + x.likelihood + '/5, impact ' + x.impact + '/5</p>' +
          '<p class="mitigation"><b>Mitigation:</b> ' + esc(x.mitigation) + '</p></div>' +
          '<div class="risk-meter">Severity <b>' + x.severity + '/25</b> \u2192 <b>' + x.residual + '/25</b> after mitigation' + bar(x.severity * 4, 'danger') +
          '<div style="margin-top:6px">Mitigation score <b>' + Math.round(x.effectiveness) + '%</b></div>' + bar(x.effectiveness) + '</div></div>';
      }).join('') + '</div></div>').join('');
  }

  function renderRecommendation(rec) {
    return '<div class="callout"><h4>' + esc(rec.headline) + '</h4><p>' + esc(rec.rationale) + '</p><p class="hint" style="margin-top:8px">Confidence: <strong>' + rec.confidence + '%</strong></p></div>' +
      '<div><h4>Final ranking</h4><ol class="rank-list">' + rec.ranked.map(r =>
        '<li class="rank-item"><div><strong>' + esc(r.name) + '</strong><div class="hint">Matrix ' + r.matrix + ' \u00b7 Scenarios ' + r.expected + ' \u00b7 Risk exposure ' + r.exposure + '%</div>' + bar(r.final) + '</div><div class="rank-score">' + r.final + '</div></li>').join('') + '</ol></div>' +
      '<div><h4>Action plan</h4><ol class="plan-list">' + rec.plan.map(p => '<li><span class="when">' + esc(p.when) + '</span>' + esc(p.action) + '</li>').join('') + '</ol></div>' +
      '<div><h4>Fallback</h4><p>' + esc(rec.fallback) + '</p></div>';
  }

  /* ---------- pipeline runner ---------- */
  const setStep = (n, st) => { $('#pipeline li[data-step="' + n + '"]').className = 'is-' + st; };

  function openCard(n) {
    $('#empty-state').hidden = true;
    $('#results').hidden = false;
    const card = $('#step-' + n);
    card.hidden = false;
    card.classList.add('is-loading');
    $('.step-body', card).innerHTML = '';
    $('.step-time', card).textContent = '';
    return card;
  }

  async function runStage(n, inp, localFn, ctx, renderFn, bodySel) {
    setStep(n, 'active');
    const card = openCard(n);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t0 = performance.now();
    let result = localFn();
    let source = 'Local engine';
    if (state.settings.useClaude && state.settings.apiKey) {
      try { result = await claudeStages[n](inp, result, ctx); source = 'Claude'; }
      catch (err) { toast('Step ' + n + ': Claude failed (' + err.message + '). Used local engine.'); }
    } else {
      await sleep(550);
    }
    const ms = performance.now() - t0;
    $(bodySel).innerHTML = renderFn(result);
    card.classList.remove('is-loading');
    $('.step-time', card).textContent = source + ' \u00b7 ' + (ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms');
    setStep(n, 'done');
    return { result, source };
  }

  async function run() {
    if (state.running) return;
    const inp = readInput();
    const err = validate(inp);
    const errEl = $('#form-error');
    if (err) { errEl.textContent = err; errEl.hidden = false; return; }
    errEl.hidden = true;

    state.running = true;
    $('#run-btn').disabled = true;
    $('#copy-btn').disabled = true;
    $('#export-btn').disabled = true;
    $$('#pipeline li').forEach(li => { li.className = 'is-idle'; });
    $$('.step-card').forEach(c => { c.hidden = true; });

    const ctx = {};
    try {
      ctx.dec = (await runStage(1, inp, () => localDecompose(inp), ctx, renderDecomp, '#out-decomposition')).result;
      ctx.cmp = (await runStage(2, inp, () => localCompare(inp), ctx, renderMatrix, '#out-matrix')).result;
      ctx.scn = (await runStage(3, inp, () => localScenarios(ctx.cmp), ctx, s => renderScenarios(s, 0), '#out-scenarios')).result;
      bindScenarioTabs(ctx.scn);
      ctx.rsk = (await runStage(4, inp, () => localRisk(inp, ctx.cmp, ctx.dec), ctx, renderRisk, '#out-risk')).result;
      const rec = await runStage(5, inp, () => localRecommend(inp, ctx.dec, ctx.cmp, ctx.scn, ctx.rsk), ctx, renderRecommendation, '#out-recommendation');
      ctx.rec = rec.result;
      state.result = { inp, ...ctx };
      $('#copy-btn').disabled = false;
      $('#export-btn').disabled = false;
    } catch (e) {
      console.error(e);
      toast('Simulation stopped: ' + e.message);
    } finally {
      state.running = false;
      $('#run-btn').disabled = false;
    }
  }

  function bindScenarioTabs(scn) {
    const body = $('#out-scenarios');
    body.onclick = e => {
      const tab = e.target.closest('.scenario-tab');
      if (!tab) return;
      body.innerHTML = renderScenarios(scn, Number(tab.dataset.i));
      $('.scenario-tab[aria-selected="true"]', body).focus();
    };
  }

  /* ---------- report export ---------- */
  function buildReport() {
    const r = state.result;
    if (!r) return '';
    const L = [];
    L.push('# SHADOW AI report: ' + r.inp.title, '', '_Generated ' + new Date().toLocaleString() + '_', '');
    L.push('## 1. Problem decomposition', r.dec.coreQuestion, '', '- Domain: ' + r.dec.domain, '- Urgency: ' + r.dec.urgency + ', uncertainty: ' + r.dec.uncertainty);
    r.dec.constraints.forEach(c => L.push('- Constraint: ' + c));
    L.push('- People affected: ' + r.dec.stakeholders.join(', '), '');
    L.push('## 2. Option comparison', '', '| Option | Cost | Time | Impact | Risk | Score |', '|---|---|---|---|---|---|');
    r.cmp.options.forEach(o2 => L.push('| ' + o2.name + ' | ' + o2.costLabel + ' | ' + o2.timeLabel + ' | ' + o2.impact + '/10 | ' + o2.risk + '/10 | ' + o2.score + ' |'));
    L.push('');
    r.cmp.options.forEach(o2 => { L.push('**' + o2.name + '**', 'Pros: ' + o2.pros.join('; '), 'Cons: ' + o2.cons.join('; '), ''); });
    L.push('## 3. Future scenarios', '');
    r.scn.forEach(s => {
      L.push('### ' + s.name + ' (expected ' + s.expected + '/100)');
      L.push('- Best (' + s.best.p + '%): ' + s.best.text, '- Realistic (' + s.realistic.p + '%): ' + s.realistic.text, '- Worst (' + s.worst.p + '%): ' + s.worst.text, '');
    });
    L.push('## 4. Risk assessment', '');
    r.rsk.forEach(s => {
      L.push('### ' + s.name + ' (residual exposure ' + s.exposure + '%)');
      s.risks.forEach(x => L.push('- ' + x.title + ': severity ' + x.severity + '/25 -> ' + x.residual + '/25. Mitigation: ' + x.mitigation));
      L.push('');
    });
    L.push('## 5. Recommendation', '', '**' + r.rec.headline + '** (confidence ' + r.rec.confidence + '%)', '', r.rec.rationale, '', '### Ranking');
    r.rec.ranked.forEach((x, i) => L.push((i + 1) + '. ' + x.name + ' \u2013 ' + x.final + '/100'));
    L.push('', '### Action plan');
    r.rec.plan.forEach((p, i) => L.push((i + 1) + '. **' + p.when + ':** ' + p.action));
    L.push('', '**Fallback:** ' + r.rec.fallback);
    return L.join('\n');
  }

  async function copyReport() {
    const text = buildReport();
    try { await navigator.clipboard.writeText(text); toast('Report copied to clipboard.'); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Report copied to clipboard.'); } catch (e2) { toast('Copy failed. Use Download report instead.'); }
      ta.remove();
    }
  }

  function downloadReport() {
    const blob = new Blob([buildReport()], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shadow-ai-report.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- UI wiring ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function updateBadge() {
    const b = $('#engine-badge');
    const on = state.settings.useClaude && state.settings.apiKey;
    b.textContent = on ? 'Claude \u00b7 ' + state.settings.model : 'Local engine';
    b.classList.toggle('is-claude', !!on);
  }

  function resetAll() {
    if (state.running) return;
    state.demo = null; state.result = null;
    $('#decision-title').value = ''; $('#decision-context').value = '';
    $('#context-count').textContent = '0';
    setOptions(['', '']);
    setWeights({ cost: 5, time: 5, impact: 7, risk: 6 });
    $$('.demo-card').forEach(c => c.classList.remove('is-selected'));
    $$('#pipeline li').forEach(li => { li.className = 'is-idle'; });
    $$('.step-card').forEach(c => { c.hidden = true; });
    $('#results').hidden = true; $('#empty-state').hidden = false;
    $('#form-error').hidden = true;
    $('#copy-btn').disabled = true; $('#export-btn').disabled = true;
  }

  function loadDemo(key) {
    if (state.running) return;
    const d = DEMOS[key];
    state.demo = key;
    $$('.demo-card').forEach(c => c.classList.toggle('is-selected', c.dataset.scenario === key));
    $('#decision-title').value = d.title;
    $('#decision-context').value = d.context;
    $('#context-count').textContent = String(d.context.length);
    setOptions(d.options.map(x => x.name));
    setWeights(d.weights);
    $('#form-error').hidden = true;
    run();
  }

  function init() {
    setOptions(['', '']);
    $('#add-option').addEventListener('click', () => addOptionRow(''));
    $('#run-btn').addEventListener('click', run);
    $('#reset-btn').addEventListener('click', resetAll);
    $('#copy-btn').addEventListener('click', copyReport);
    $('#export-btn').addEventListener('click', downloadReport);
    $('#demo-grid').addEventListener('click', e => { const c = e.target.closest('.demo-card'); if (c) loadDemo(c.dataset.scenario); });
    $('#decision-context').addEventListener('input', e => { $('#context-count').textContent = String(e.target.value.length); });
    $$('input[type="range"]').forEach(r => r.addEventListener('input', () => { r.nextElementSibling.textContent = r.value; }));
    // typing a custom decision detaches it from the demo data
    $('#decision-title').addEventListener('input', () => { if (state.demo) { state.demo = null; $$('.demo-card').forEach(c => c.classList.remove('is-selected')); } });

    const dlg = $('#settings-dialog');
    $('#settings-btn').addEventListener('click', () => {
      $('#use-claude').checked = state.settings.useClaude;
      $('#api-key').value = state.settings.apiKey;
      $('#model-name').value = state.settings.model;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    });
    $('#settings-save').addEventListener('click', () => {
      const key = $('#api-key').value.trim();
      const want = $('#use-claude').checked;
      state.settings.apiKey = key;
      state.settings.model = $('#model-name').value.trim() || 'claude-sonnet-4-6';
      state.settings.useClaude = want && key.length > 0;
      if (want && !key) toast('Enter an API key to use Claude. Using the local engine.');
      else toast(state.settings.useClaude ? 'Claude analysis enabled.' : 'Local engine enabled.');
      updateBadge();
    });
    updateBadge();
  }

  init();
})();
