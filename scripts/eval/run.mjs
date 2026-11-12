// Quality-vs-wait test runner.
//
// Asks the site's own chat route (running on your Mac with `npm run dev`) for options on each
// test scenario, at each thinking setting, several times. Times each reply, runs the code checks,
// prints a summary, and writes a report you can score by eye without knowing which setting is which.
//
// Run from the trust-from-zero folder, with the site running in another window:
//   node scripts/eval/run.mjs
// Options: --runs 3  --settings default,medium,low,off  --scenarios A,B,C,D  --url http://localhost:3000
//          --mode next   (stops the conversation before "Show me options now" and checks the reply asks
//                         the right next question instead of giving options; scenarios with "nextQuestion")

import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "3"));
const SETTINGS = arg("settings", "default,medium,low").split(",");
const ONLY = arg("scenarios", "");
const URL_BASE = arg("url", "http://localhost:3000");
const MODE = arg("mode", "options");

const { scenarios: all } = JSON.parse(fs.readFileSync(path.join(here, "scenarios.json"), "utf8"));
const scenarios = (ONLY ? all.filter((s) => ONLY.split(",").includes(s.id)) : all).filter((s) => MODE !== "next" || s.nextQuestion);
const instructions = fs.readFileSync(path.join(root, "lib", "instructions.md"), "utf8");

// ---------- building the conversation the way the page does ----------
const NOTES = {
  message: "They typed a message.",
  example: "They tapped one of the example questions on the start screen.",
  options_now: 'They tapped "Show me options now". Give options now with what you know.',
};
function saidText(ys) {
  if (!ys) return "(nothing yet)";
  return "Their question: " + ys.question + "\n" + ys.items.map((i) => "- " + i.label + ": " + i.detail).join("\n");
}
function userTurn(note, ys, text) {
  return "PAGE NOTE: " + NOTES[note] + "\nYOU'VE SAID LIST (current; if the person edited it, this version is true):\n" + saidText(ys) + "\n\nPERSON: " + text;
}
function conversation(s) {
  const turns = [{ role: "user", content: userTurn(s.opening.note, null, s.opening.text) }];
  s.exchanges.forEach(([question, answer]) => {
    const reply = { reflection: "", message: question, why: "", skippable: true, choices: [], youveSaid: s.youveSaid, pulling: null, options: null, notCovered: null };
    turns.push({ role: "assistant", content: JSON.stringify(reply) });
    turns.push({ role: "user", content: userTurn("message", s.youveSaid, answer) });
  });
  if (MODE === "next") return turns;
  turns.push({ role: "assistant", content: JSON.stringify({ reflection: "", message: "Anything else you'd like to add before I lay out the options?", why: "", skippable: true, choices: [], youveSaid: s.youveSaid, pulling: null, options: null, notCovered: null }) });
  turns.push({ role: "user", content: userTurn("options_now", s.youveSaid, "Show me options now.") });
  return turns;
}

// ---------- asking the route ----------
async function ask(turns, setting) {
  const headers = { "Content-Type": "application/json" };
  headers["x-eval-setting"] = setting;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(URL_BASE + "/api/chat", { method: "POST", headers, body: JSON.stringify({ messages: turns }) });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      console.log(`  (busy or rate-limited, waiting 30s and trying again)`);
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    if (!res.ok) return { error: (await res.json().catch(() => ({}))).error || "http_" + res.status };
    const raw = await res.text();
    let text = "", end = null, error = null;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (ev.type === "text") text += ev.text;
      else if (ev.type === "end") end = ev;
      else if (ev.type === "error") error = ev.error;
    }
    if (error) return { error };
    let reply = null;
    try { reply = JSON.parse(text); } catch { return { error: "unreadable", end }; }
    return { reply, end };
  }
}

// ---------- code checks ----------
const BANNED = /\b(should|must|need to|best|i'd recommend|i recommend|great news|smart move)\b/gi;
const PRODUCTS = /\b(vanguard|hargreaves|aj bell|trading ?212|freetrade|nutmeg|moneybox|plum|chip|wealthify|pensionbee|fidelity|interactive investor|monzo|starling|revolut|chase|marcus|nationwide|barclays|lloyds|halifax|hsbc|santander|natwest|first direct|tesco bank|virgin money|zopa|ns&i|klarna|creditfix|hanover|payplan)\b/gi;

function userText(r) {
  const out = [r.reflection, r.message, r.why];
  for (const c of r.pulling?.claims || []) out.push(c.item, c.lead, c.usualOrder?.text, c.added);
  for (const o of r.options?.items || []) out.push(o.title, o.whyForYou, ...o.pros, ...o.cons, o.lookInto?.text);
  for (const x of r.options?.ruledOut || []) out.push(x.title, x.reason);
  out.push(r.options?.wouldChange, r.options?.sharpen?.question, ...(r.options?.sharpen?.choices || []), r.notCovered?.topic, r.notCovered?.reason);
  return out.filter(Boolean).join("\n");
}
function numbersIn(t) {
  return (t.match(/\d[\d,]*(\.\d+)?k?/gi) || []).map((n) => {
    let v = n.toLowerCase().replace(/,/g, "");
    if (v.endsWith("k")) v = String(parseFloat(v) * 1000);
    return String(parseFloat(v));
  });
}
// "What's pulling on this money" covers every claim, and every claim shows up in an option or in "Not included".
// Matched loosely: a claim counts as covered if the start of a word of 3+ letters from its name ("invest" for
// "Investing", "car" for "Car") appears anywhere in an option (title, why it's here, pros, cons) or in a
// "Not included" line. Uncovered claims are listed for checking by eye.
const SKIP_WORDS = new Set(["the", "and", "for", "your", "more", "into", "some", "with", "from", "this", "that", "money", "cost", "costs"]);
function uncoveredClaims(r) {
  const where = [...(r.options?.items || []).flatMap((o) => [o.title, o.whyForYou, ...o.pros, ...o.cons]), ...(r.options?.ruledOut || []).flatMap((x) => [x.title, x.reason])].join(" ").toLowerCase();
  return (r.pulling?.claims || []).map((c) => c.item).filter((item) => {
    const words = item.toLowerCase().match(/[a-z]{3,}/g) || [];
    return !words.filter((w) => !SKIP_WORDS.has(w)).some((w) => where.includes(w.slice(0, 5)));
  });
}
function check(s, r) {
  const text = userText(r);
  const textWithoutChips = userText({ ...r, choices: [], options: r.options && { ...r.options, sharpen: r.options.sharpen && { ...r.options.sharpen, choices: [] } } });
  const titles = (r.options?.items || []).map((o) => o.title).join("\n");
  const allowedNumbers = new Set([...numbersIn(JSON.stringify(conversation(s))), ...numbersIn(instructions)]);
  const items = r.options?.items || [];
  // Since 10 Nov the usual order's wiki links sit on the claims, not the options.
  const links = new Set((r.pulling?.claims || []).map((c) => c.usualOrder?.page).filter(Boolean));
  const asked = [r.message, r.why, ...(r.choices || [])].join("\n");
  const common = {
    noBanned: !(text.match(BANNED) || []).length,
    noProducts: !(text.match(PRODUCTS) || []).length,
    noNewFigures: numbersIn(textWithoutChips).every((n) => allowedNumbers.has(n)),
    _banned: [...new Set((text.match(BANNED) || []).map((w) => w.toLowerCase()))],
    _products: [...new Set(text.match(PRODUCTS) || [])],
    _newFigures: [...new Set(numbersIn(textWithoutChips).filter((n) => !allowedNumbers.has(n)))],
  };
  if (MODE === "next") return {
    asksNotOptions: !items.length && /\?/.test(r.message),
    rightQuestion: !items.length && new RegExp(s.nextQuestion.pattern, "i").test(asked),
    ...common,
  };
  return {
    gotOptions: items.length >= 2 && items.length <= 4,
    pulling: (r.pulling?.claims || []).length >= 2 && uncoveredClaims(r).length === 0,
    gaps: s.gaps.every((g) => new RegExp(g.pattern, "i").test(g.where === "titles" ? titles : text)),
    links: s.mustLink.every((p) => links.has(p)),
    structure: items.length > 0 && items.every((o) => o.whyForYou.trim() && o.cons.length >= 1),
    noBanned: !(text.match(BANNED) || []).length,
    noProducts: !(text.match(PRODUCTS) || []).length,
    noNewFigures: numbersIn(textWithoutChips).every((n) => allowedNumbers.has(n)),
    _banned: [...new Set((text.match(BANNED) || []).map((w) => w.toLowerCase()))],
    _products: [...new Set(text.match(PRODUCTS) || [])],
    _newFigures: [...new Set(numbersIn(textWithoutChips).filter((n) => !allowedNumbers.has(n)))],
    _uncovered: uncoveredClaims(r),
  };
}
const CHECKS = MODE === "next"
  ? ["asksNotOptions", "rightQuestion", "noBanned", "noProducts", "noNewFigures"]
  : ["gotOptions", "pulling", "gaps", "links", "structure", "noBanned", "noProducts", "noNewFigures"];

// ---------- run ----------
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + (MODE === "next" ? "-next" : "");
const outDir = path.join(here, "results", stamp);
fs.mkdirSync(outDir, { recursive: true });

const jobs = [];
for (let run = 1; run <= RUNS; run++)
  for (const s of scenarios)
    for (const setting of [...SETTINGS].sort(() => Math.random() - 0.5)) jobs.push({ run, s, setting });

console.log(`Running ${jobs.length} options replies (${scenarios.length} scenarios x ${SETTINGS.length} settings x ${RUNS} runs). This takes a while.\n`);
const results = [];
for (const [i, job] of jobs.entries()) {
  const { reply, end, error } = await ask(conversation(job.s), job.setting);
  const checks = reply ? check(job.s, reply) : null;
  const firstS = end ? end.firstMs / 1000 : null, totalS = end ? end.totalMs / 1000 : null;
  results.push({ scenario: job.s.id, setting: job.setting, run: job.run, error, stop: end?.stop, firstS, totalS, tokens: end?.tokens, checks, reply });
  const fails = checks ? CHECKS.filter((c) => !checks[c]) : [];
  console.log(`${String(i + 1).padStart(2)}/${jobs.length}  ${job.s.id}  ${job.setting.padEnd(7)}  ` + (error ? `ERROR ${error}` : `${firstS?.toFixed(1)}s / ${totalS?.toFixed(1)}s  ${fails.length ? "fails: " + fails.join(", ") : "all checks pass"}`));
}

// ---------- summary ----------
const median = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const pct = (a) => (a.length ? Math.round((100 * a.filter(Boolean).length) / a.length) + "%" : "-");
const rows = SETTINGS.map((setting) => {
  const rs = results.filter((r) => r.setting === setting);
  const ok = rs.filter((r) => r.checks);
  const row = {
    setting,
    replies: rs.length,
    errors: rs.length - ok.length,
    "first words (median)": median(ok.map((r) => r.firstS))?.toFixed(1) + "s",
    "finished (median)": median(ok.map((r) => r.totalS))?.toFixed(1) + "s",
    "thinking tokens (median)": median(ok.map((r) => r.tokens?.thinking)),
  };
  for (const c of CHECKS) row[c] = pct(ok.map((r) => r.checks[c]));
  return row;
});
console.log("\nSummary by setting (percent of replies passing each check):");
console.table(rows);

// ---------- blind report for scoring by eye ----------
const shuffled = results.filter((r) => r.reply).sort(() => Math.random() - 0.5);
shuffled.forEach((r, i) => (r.code = r.scenario + "-" + String(i + 1).padStart(2, "0")));
fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ settings: SETTINGS, runs: RUNS, summary: rows, results }, null, 2));

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const card = (r) => {
  const o = r.reply.options;
  return `<section class="reply" data-code="${r.code}">
  <h3>${r.code}</h3>
  ${r.reply.reflection ? `<p>${esc(r.reply.reflection)}</p>` : ""}
  <p class="msg">${esc(r.reply.message)}</p>
  ${r.reply.why ? `<p class="meta">Why I'm asking: ${esc(r.reply.why)}</p>` : ""}
  ${r.reply.choices?.length ? `<p class="meta">Answers to tap: ${r.reply.choices.map(esc).join(" / ")}</p>` : ""}
  ${(r.reply.pulling?.claims || []).length ? `<div class="pull"><b>What's pulling on this money:</b><ul>${r.reply.pulling.claims.map((c) => `<li><b>${esc(c.item)}</b> ${esc(c.lead)} <span class="meta">${esc(c.usualOrder?.text)}${c.usualOrder?.page ? ` <span class="pg">${esc(c.usualOrder.page)}</span>` : ""}</span>${c.added ? ` <i>Added: ${esc(c.added)}</i>` : ""}</li>`).join("")}</ul></div>` : ""}
  ${(o?.items || []).map((it, n) => `<div class="opt"><h4>${n + 1}. ${esc(it.title)}</h4>
    <p><b>Why it's here for you:</b> ${esc(it.whyForYou)}</p>
    <p><b>Pros:</b> ${it.pros.map(esc).join("; ")}</p>
    <p><b>Cons:</b> ${it.cons.map(esc).join("; ")}</p>
    <p><b>Look into:</b> ${esc([it.lookInto?.text, it.lookInto?.service].filter(Boolean).join(" on "))}</p></div>`).join("")}
  ${o?.ruledOut?.length ? `<p><b>Not included:</b> ${o.ruledOut.map((x) => esc(x.title) + (x.reason ? " (" + esc(x.reason) + ")" : "")).join("; ")}</p>` : ""}
  ${o?.wouldChange ? `<p><b>What would most change the picture:</b> ${esc(o.wouldChange)}</p>` : ""}
  ${o?.sharpen ? `<p><b>Sharpen:</b> ${esc(o.sharpen.question)} (${o.sharpen.choices.map(esc).join(" / ")})</p>` : ""}
  ${r.checks._banned.length || r.checks._products.length || r.checks._newFigures.length || r.checks._uncovered?.length ? `<p class="flag">Flagged by the code checks: ${[...r.checks._banned.map((w) => `"${w}"`), ...r.checks._products, ...r.checks._newFigures.map((n) => "figure " + n), ...(r.checks._uncovered || []).map((c) => "not in any option: " + c)].map(esc).join(", ")}</p>` : ""}
  <div class="score">
    <span>Specific to them</span>${[1, 2, 3].map((v) => `<label><input type="radio" name="${r.code}-specific" value="${v}"> ${v}</label>`).join("")}
    <span>Tone</span>${[1, 2, 3].map((v) => `<label><input type="radio" name="${r.code}-tone" value="${v}"> ${v}</label>`).join("")}
  </div>
</section>`;
};
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Options test: score by eye</title>
<style>
:root{--bg:#FAFAF8;--surface:#fff;--ink:#1C1C1C;--muted:#5A5A5A;--line:#DDDBD5;--flag:#FCEBD9}
@media (prefers-color-scheme:dark){:root{--bg:#151515;--surface:#1E1E1E;--ink:#ECECEC;--muted:#A8A8A8;--line:#3A3A3A;--flag:#3D2A17}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:16px}
h2{margin-top:40px}.reply{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
.reply h3{margin:0 0 8px;color:var(--muted);font-size:14px}.msg{font-weight:600}.meta{color:var(--muted)}
.opt{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}.opt h4{margin:0 0 4px}.opt p{margin:2px 0}
.pg{color:var(--muted);font-size:13px}.flag{background:var(--flag);padding:6px 10px;border-radius:8px}
.score{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;border-top:1px solid var(--line);margin-top:12px;padding-top:12px}
.score span{font-weight:600}.score label{min-height:32px;display:inline-flex;align-items:center;gap:4px}
textarea{width:100%;min-height:120px}button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
</style></head><body><main>
<h1>Options test: score by eye</h1>
<p>Each reply is labelled with a code, not its thinking setting, so you can score without knowing which is which. Score each one 1 to 3 on whether the "Why it's here for you" lines are specific to the person, and on tone (1 = poor, 3 = right). Then tap "Show my scores" and paste the text into the chat.</p>
${scenarios.map((s) => `<h2>${esc(s.id)}. ${esc(s.name)}</h2><p class="meta">${MODE === "next" ? "Next question should be: " + esc(s.nextQuestion.label) : "Should raise: " + s.gaps.map((g) => esc(g.label)).join("; ")}.</p>` + shuffled.filter((r) => r.scenario === s.id).sort((a, b) => a.code.localeCompare(b.code)).map(card).join("")).join("")}
<p><button id="done">Show my scores</button></p><textarea id="out" readonly hidden></textarea>
<script>
document.getElementById("done").onclick=function(){var s={};document.querySelectorAll(".reply").forEach(function(r){var c=r.dataset.code,g=function(k){var x=r.querySelector('input[name="'+c+'-'+k+'"]:checked');return x?Number(x.value):null;};s[c]={specific:g("specific"),tone:g("tone")};});var o=document.getElementById("out");o.hidden=false;o.value="Scores for ${stamp}: "+JSON.stringify(s);o.focus();o.select();};
</script></main></body></html>`;
fs.writeFileSync(path.join(outDir, "report.html"), html);
console.log(`\nReport to score by eye: ${path.relative(root, path.join(outDir, "report.html"))}`);
console.log(`Open it with: open "${path.relative(root, path.join(outDir, "report.html"))}"`);
