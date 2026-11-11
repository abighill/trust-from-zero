// Side-by-side check: for each scenario, one reply from each of two settings, placed left or right
// at random so you can't tell which is which. You pick the one you'd rather receive.
//
// Run from the trust-from-zero folder:
//   node scripts/eval/compare.mjs scripts/eval/results/<folder>
// Options: --a default --b low --run 1
// To compare two test runs (e.g. 4 Nov against today), name the second folder with --b-dir:
//   node scripts/eval/compare.mjs scripts/eval/results/<new folder> --b-dir scripts/eval/results/2026-11-04-18-40 --a low --b low

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.log("Say which results folder, e.g. node scripts/eval/compare.mjs scripts/eval/results/2026-11-04-18-40"); process.exit(1); }
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const A = arg("a", "default"), B = arg("b", "low"), RUN = Number(arg("run", "1"));
const B_DIR = arg("b-dir", dir);

const resultsA = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8")).results;
const resultsB = JSON.parse(fs.readFileSync(path.join(B_DIR, "results.json"), "utf8")).results;
const labelA = B_DIR === dir ? A : path.basename(dir) + " " + A, labelB = B_DIR === dir ? B : path.basename(B_DIR) + " " + B;
const { scenarios } = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "scenarios.json"), "utf8"));
const pick = (results, id, setting) => results.find((r) => r.scenario === id && r.setting === setting && r.run === RUN && r.reply)
  || results.find((r) => r.scenario === id && r.setting === setting && r.reply);

const key = {};
const pairs = scenarios.map((s) => {
  const a = pick(resultsA, s.id, A), b = pick(resultsB, s.id, B);
  if (!a || !b) return null;
  const flip = Math.random() < 0.5;
  key[s.id] = flip ? { left: labelB, right: labelA } : { left: labelA, right: labelB };
  return { s, left: flip ? b : a, right: flip ? a : b };
}).filter(Boolean);

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const AREAS = ["Budget & costly debt", "Starter emergency fund", "Pension match", "Other debts", "Full emergency fund", "Goals", "Short-term goals", "Long-term goals"];
const reply = (r) => {
  // Replies from before 9 Nov have "position" (the step bar); later ones have "pulling".
  const p = r.reply.position, pl = r.reply.pulling?.claims, o = r.reply.options;
  return `${r.reply.reflection ? `<p>${esc(r.reply.reflection)}</p>` : ""}<div class="msg">${esc(r.reply.message)}</div>
  ${p ? `<div class="snap"><b>Where you are:</b> ${p.areas.map((a) => "step " + a + " (" + AREAS[a - 1] + ")").join(" and ")}<br><span class="m">${esc(p.why)}</span></div>` : ""}
  ${pl?.length ? `<div class="snap"><b>What's pulling on this money:</b><ul>${pl.map((c) => `<li>${esc(c.item)}${c.said ? ": " + esc(c.said) : ""}<br><span class="m">${esc(c.usualOrder?.text)}</span>${c.added ? `<br><i>Added: ${esc(c.added)}</i>` : ""}</li>`).join("")}</ul></div>` : ""}
  ${(o?.items || []).map((it, n) => `<div class="card"><h4>${n + 1}. ${esc(it.title)}</h4>
    <div class="row"><span>Why it's here for you</span><p>${esc(it.whyForYou)}</p></div>
    <div class="row"><span>Pros</span><ul>${it.pros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="row"><span>Cons</span><ul>${it.cons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    ${it.usualOrderSays ? `<div class="row"><span>What the usual order says</span><ul>${it.usualOrderSays.map((u) => `<li>${esc(u.text)}</li>`).join("")}</ul></div>` : ""}
    <div class="row"><span>Look into</span><p>${esc(typeof it.lookInto === "string" ? it.lookInto : [it.lookInto?.text, it.lookInto?.service].filter(Boolean).join(" on "))}</p></div></div>`).join("")}
  ${o?.ruledOut?.length ? `<p><b>Not included:</b> ${o.ruledOut.map((x) => esc(x.title) + (x.reason ? " (" + esc(x.reason) + ")" : "")).join("; ")}</p>` : ""}
  ${o?.wouldChange ? `<p><b>What would most change the picture:</b> ${esc(o.wouldChange)}</p>` : ""}
  ${o?.sharpen ? `<p class="m">Then asks: ${esc(o.sharpen.question)}</p>` : ""}`;
};
const said = (s) => `<p class="m"><b>They said:</b> ${esc(s.youveSaid.question)}. ${s.youveSaid.items.map((i) => esc(i.label + ": " + i.detail)).join(" · ")}</p>`;

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Which would you rather get?</title>
<style>
:root{--bg:#FAFAF8;--surface:#fff;--ink:#1C1C1C;--muted:#5A5A5A;--line:#DDDBD5;--accent:#1F4690;--soft:#E4ECFA}
@media (prefers-color-scheme:dark){:root{--bg:#151515;--surface:#1E1E1E;--ink:#ECECEC;--muted:#A8A8A8;--line:#3A3A3A;--accent:#8FB0F0;--soft:#22304A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1400px;margin:0 auto;padding:16px}.m{color:var(--muted)}
.pair{border-top:2px solid var(--line);margin-top:28px;padding-top:12px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){.cols{grid-template-columns:1fr}}
.col{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}
.col h3{margin:0 0 8px;font-size:14px;color:var(--muted)}.msg{font-weight:600;margin-bottom:8px}
.snap{background:var(--soft);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:14px}
.card{border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0}.card h4{margin:0 0 6px}
.row{display:grid;grid-template-columns:130px 1fr;gap:8px;font-size:14px;margin:4px 0}.row span{color:var(--muted);font-weight:600;font-size:13px}
.row p,.row ul{margin:0}.row ul{padding-left:18px}
.vote{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.vote button{font:inherit;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--surface);color:var(--ink);cursor:pointer}
.vote button.on{background:var(--accent);color:var(--surface)}
textarea{width:100%;min-height:60px;font:inherit}#done{font:inherit;min-height:44px;padding:10px 18px;border-radius:10px;border:0;background:var(--accent);color:var(--surface);cursor:pointer}
</style></head><body><main>
<h1>Which would you rather get?</h1>
<p>Four scenarios, two versions of the options each. Skim both and pick the one you'd rather receive if you were this person. "Same" is a fine answer. Add a few words only if something jumps out.</p>
${pairs.map(({ s, left, right }) => `<section class="pair" data-id="${s.id}">
  <h2>${esc(s.id)}. ${esc(s.name)}</h2>${said(s)}
  <div class="cols"><div class="col"><h3>Left</h3>${reply(left)}</div><div class="col"><h3>Right</h3>${reply(right)}</div></div>
  <div class="vote">${["Left better", "Same", "Right better"].map((v) => `<button type="button" data-v="${v}">${v}</button>`).join("")}</div>
  <textarea placeholder="Optional: what made the difference?"></textarea>
</section>`).join("")}
<p><button id="done" type="button">Show my picks</button></p><textarea id="out" readonly hidden></textarea>
<script>
document.querySelectorAll(".vote").forEach(function(v){v.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;v.querySelectorAll("button").forEach(function(x){x.classList.toggle("on",x===b);});});});
document.getElementById("done").onclick=function(){var out=[];document.querySelectorAll(".pair").forEach(function(p){var on=p.querySelector(".vote .on");out.push(p.dataset.id+": "+(on?on.dataset.v:"(no pick)")+(p.querySelector("textarea").value.trim()?" ("+p.querySelector("textarea").value.trim()+")":""));});var o=document.getElementById("out");o.hidden=false;o.value="Picks for ${esc(path.basename(dir))}: "+out.join(" | ");o.focus();o.select();};
</script></main></body></html>`;

fs.writeFileSync(path.join(dir, "compare.html"), html);
fs.writeFileSync(path.join(dir, "compare-key.json"), JSON.stringify(key, null, 2));
console.log(`Made ${pairs.length} pairs (${labelA} vs ${labelB}). Open with: open "${path.join(dir, "compare.html")}"`);
