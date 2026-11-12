// The page's own code, carried over from the "What comes first" artifact (ported 9 Nov 2026),
// styled with the Unstuck design system (10 Nov 2026).
// Changed for the website: replies come from /api/chat instead of Claude's artifact tools,
// the instructions live on the server (lib/instructions.md), and Download is a normal browser download.
(function(){
  "use strict";
  var EXAMPLES = [
    "Should I pay off my loan early or put more into my pension?",
    "I've got some money spare. Save it, invest it, or a bit of both?",
    "My car's on its last legs. Car loan, a finance deal, or a bike and a season ticket?"
  ];
  // Where "Look into" links go. Claude picks the name (lib/replySchema.ts); the page holds the address.
  var SERVICES = {
    "MoneySavingExpert": "https://www.moneysavingexpert.com/",
    "MoneyHelper": "https://www.moneyhelper.org.uk/",
    "Pension Wise": "https://www.moneyhelper.org.uk/pensionwise",
    "StepChange": "https://www.stepchange.org/",
    "National Debtline": "https://nationaldebtline.org/",
    "Citizens Advice": "https://www.citizensadvice.org.uk/",
    "Christians Against Poverty": "https://capuk.org/",
    "Debt Camel": "https://debtcamel.co.uk/",
    "entitledto": "https://www.entitledto.co.uk/",
    "Turn2us": "https://www.turn2us.org.uk/",
    "GamCare": "https://www.gamcare.org.uk/",
    "Surviving Economic Abuse": "https://survivingeconomicabuse.org/",
    "Macmillan": "https://www.macmillan.org.uk/"
  };
  // Lucide icons (lucide.dev, ISC licence), the set listed in the design system.
  var ICONS = {
    "send-horizontal": "<path d=\"M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z\"/><path d=\"M6 12h16\"/>",
    "arrow-right": "<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>",
    "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>",
    "skip-forward": "<path d=\"M21 4v16\"/><path d=\"M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "plus": "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>",
    "minus": "<path d=\"M5 12h14\"/>",
    "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>",
    "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
    "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>",
    "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
    "info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>",
    "external-link": "<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
    "rotate-ccw": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>",
    "chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
    "chevron-up": "<path d=\"m18 15-6-6-6 6\"/>"
  };
  var NOTES = {
    message: "They typed a message.",
    example: "They tapped one of the example questions on the start screen.",
    skip: "They skipped your question. Treat it as a full answer and don't ask again.",
    options_now: "They tapped \"Show me options now\". Give options now with what you know.",
    choice: "They tapped one of the answers you offered.",
    sharpen: "They answered the question under the options. Give updated options.",
    covered: "They tapped \"I've got this covered\" on a claim the usual order added (see WHAT THEY CHANGED; it's in the You've said list now). Leave that claim out of \"pulling\" and the options, and give updated options.",
    update: "They edited the \"You've said\" list. Acknowledge it briefly and revisit anything that depended on what changed. If options were already shown, give updated options."
  };
  var MAX_BYTES = 50000; // the conversation sent each time; the server refuses anything much bigger
  var MAX_MESSAGES = 41; // the server's limit on back-and-forths
  var STATUS = {
    ask: ["Reading what you've said", "Checking the usual order", "Choosing the next question"],
    options: ["Reading what you've said", "Checking the usual order", "Weighing up the options"]
  };

  var state = {
    turns: [], ui: [], said: [], question: "", changes: [], editing: -1,
    pulling: null, lastOptions: null, lastAction: "message", timer: null, busy: false, ctl: null, blocked: false, saidOpen: null
  };


  var $ = function(id){ return document.getElementById(id); };
  function el(tag, props, kids){
    var n = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === "text") n.textContent = props[k];
      else if (k === "cls") n.className = props[k];
      else if (k.slice(0,2) === "on") n.addEventListener(k.slice(2), props[k]);
      else if (props[k] === true) n.setAttribute(k, "");
      else if (props[k] !== false && props[k] != null) n.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function(c){ if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function bytes(s){ return new Blob([s]).size; }
  function str(v){ return typeof v === "string" ? v.trim() : (v == null ? "" : String(v).trim()); }
  function list(v){ if (Array.isArray(v)) return v.map(str).filter(Boolean); var s = str(v); return s ? [s] : []; }

  // ---------- building what Claude reads ----------
  function buildTurn(text, action){
    var said = (state.question ? "Their question: " + state.question + "\n" : "") + (state.said.length ? state.said.map(function(s){ return "- " + (s.label ? s.label + ": " : "") + s.detail; }).join("\n") : "(nothing yet)");
    var out = "PAGE NOTE: " + NOTES[action] + "\n";
    if ((action === "update" || action === "covered") && state.changes.length) out += "WHAT THEY CHANGED:\n" + state.changes.map(function(c){ return "- " + c; }).join("\n") + "\n";
    out += "YOU'VE SAID LIST (current; if the person edited it, this version is true):\n" + said + "\n\nPERSON: " + text;
    return out;
  }
  function buildInput(){
    var turns = state.turns.slice();
    var size = function(){ return turns.reduce(function(a,t){ return a + bytes(t.content); }, 0); };
    // Drop the oldest turns when the conversation gets long (the "You've said" list carries the facts forward).
    while ((size() > MAX_BYTES || turns.length > MAX_MESSAGES) && turns.length > 1) turns.shift();
    while (turns.length && turns[0].role !== "user") turns.shift();
    // After a failed reply, two of the person's messages can sit next to each other; join them.
    return turns.reduce(function(out, t){
      var last = out[out.length - 1];
      if (last && last.role === t.role) last.content += "\n\n" + t.content;
      else out.push({ role: t.role, content: t.content });
      return out;
    }, []);
  }
  function partialMessage(raw, key){
    var m = new RegExp('"' + (key || "message") + '"\\s*:\\s*"').exec(raw || "");
    if (!m) return "";
    var i = m.index + m[0].length, out = "";
    for (; i < raw.length; i++){
      var ch = raw[i];
      if (ch === "\\"){ if (i + 1 >= raw.length) break; out += ch + raw[i+1]; i++; continue; }
      if (ch === "\"") break;
      out += ch;
    }
    out = out.replace(/\\u[0-9a-fA-F]{0,3}$/, "");
    try { return JSON.parse("\"" + out + "\""); } catch(e){ return ""; }
  }
  // The usual order's wiki pages, with the names the links show.
  var WIKI = { "/budgeting/": "Budgeting", "/benefit-entitlement/": "Benefit entitlement", "/insurance/": "Insurance", "/debt/": "Debt",
    "/emergency-fund/": "Emergency fund", "/pensions/": "Pensions", "/goals/": "Goals", "/savings/": "Savings", "/student-loans/": "Student loans",
    "/mortgage-overpayments/": "Mortgage overpayments", "/isa-vs-lisa-vs-pension/": "ISA vs LISA vs pension", "/investing-101/": "Investing 101" };
  function rules(v){
    var arr = Array.isArray(v) ? v : (v ? [v] : []);
    return arr.map(function(x){
      if (typeof x === "string") return { text: str(x), url: "" };
      var p = str(x && x.page); if (p && p[0] !== "/") p = "/" + p; if (p && p.slice(-1) !== "/") p += "/";
      return { text: str(x && x.text), url: WIKI[p] ? "https://ukpersonal.finance" + p : "", name: WIKI[p] || "" };
    }).filter(function(x){ return x.text; });
  }
  function normalise(d){
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    var message = str(d.message);
    if (!message) return null;
    var reflection = str(d.reflection); if (reflection === message) reflection = "";
    var lead = !d.options && /^([\s\S]*[.!])\s+([A-Z][^.!?]*\?)$/.exec(message);
    if (lead){ reflection = reflection ? lead[1] + " " + reflection : lead[1]; message = lead[2]; }
    var r = { reflection: reflection, message: message, why: str(d.why), skippable: d.skippable === true, youveSaid: null, pulling: null, options: null, notCovered: null };
    var ys = d.youveSaid;
    if (ys && typeof ys === "object"){
      var arr = Array.isArray(ys) ? ys : (Array.isArray(ys.items) ? ys.items : []);
      r.youveSaid = { question: Array.isArray(ys) ? "" : str(ys.question), items: arr.map(function(x){ return typeof x === "string" ? { label: "", detail: str(x) } : { label: str(x && x.label), detail: str(x && x.detail) }; }).filter(function(x){ return x.label || x.detail; }) };
    }
    r.choices = list(d.choices).slice(0, 4);
    var pl = d.pulling && typeof d.pulling === "object" ? (Array.isArray(d.pulling) ? d.pulling : d.pulling.claims) : null;
    if (Array.isArray(pl)){
      var claims = pl.filter(function(c){ return c && str(c.item); }).slice(0, 4).map(function(c){ return { item: str(c.item), lead: str(c.lead), usualOrder: rules(c.usualOrder ? [c.usualOrder] : [])[0] || null, added: str(c.added) }; });
      if (claims.length) r.pulling = claims;
    }
    var o = d.options;
    var items = o && Array.isArray(o.items) ? o.items : (Array.isArray(o) ? o : null);
    if (items){
      items = items.filter(function(it){ return it && str(it.title); }).slice(0,4).map(function(it){
        var li = it.lookInto && typeof it.lookInto === "object" ? { text: str(it.lookInto.text), service: str(it.lookInto.service) } : { text: str(it.lookInto), service: "" };
        li.url = SERVICES[li.service] || "";
        return { title: str(it.title), whyForYou: str(it.whyForYou), pros: list(it.pros), cons: list(it.cons), lookInto: li };
      });
      var sh = o && !Array.isArray(o) && o.sharpen && typeof o.sharpen === "object" ? { question: str(o.sharpen.question), choices: list(o.sharpen.choices).slice(0, 4) } : null;
      if (sh && !sh.question) sh = null;
      var ro = o && !Array.isArray(o) && Array.isArray(o.ruledOut) ? o.ruledOut.map(function(x){ return typeof x === "string" ? { title: str(x), reason: "" } : { title: str(x && x.title), reason: str(x && x.reason) }; }).filter(function(x){ return x.title; }) : [];
      if (items.length) r.options = { items: items, wouldChange: o && !Array.isArray(o) ? str(o.wouldChange) : "", ruledOut: ro, sharpen: sh };
    }
    if (d.notCovered && typeof d.notCovered === "object" && str(d.notCovered.topic)) r.notCovered = { topic: str(d.notCovered.topic), reason: str(d.notCovered.reason) };
    return r;
  }

  // ---------- talking to Claude ----------
  function send(text, action, shown){
    text = str(text);
    if (!text || state.busy || state.blocked) return;
    state.ui.push({ who: "person", text: shown || text });
    state.turns.push({ role: "user", content: buildTurn(text, action) });
    state.lastAction = action;
    if (action === "update" || action === "covered") state.changes = [];
    request();
  }
  function request(){
    var pending = { who: "claude", text: "", thinking: true, statusIdx: 0,
      statusSet: (["options_now", "sharpen", "update", "covered"].indexOf(state.lastAction) >= 0 || state.lastOptions) ? "options" : "ask" };
    state.ui.push(pending);
    clearInterval(state.timer);
    state.timer = setInterval(function(){ if (pending.statusIdx < 2){ pending.statusIdx++; renderChat(false); } }, 2500);
    state.busy = true; state.editing = -1;
    render(true);
    var ctl = new AbortController(); state.ctl = ctl;
    ask(buildInput(), ctl.signal, function(soFar){
      var f = partialMessage(soFar, "reflection"), m = partialMessage(soFar), changed = false;
      if (f && f !== pending.reflection){ pending.reflection = f; changed = true; }
      if (m && m !== pending.text){ pending.text = m; changed = true; }
      // While the reply streams in, don't move the page: it grows below their message (12 Nov).
      if (changed){ pending.thinking = false; renderChat(false); }
    }).then(function(data){
        var r = normalise(data);
        if (!r){ fail(pending, { code: "invalid_json", text: typeof data === "string" ? data : "" }); return; }
        state.turns.push({ role: "assistant", content: JSON.stringify(data) });
        pending.text = r.message; pending.reflection = r.reflection; pending.thinking = false; pending.reply = r;
        if (r.youveSaid){
          if (r.youveSaid.question) state.question = r.youveSaid.question;
          state.said = r.youveSaid.items.map(function(x){ var old = state.said.filter(function(s){ return s.label === x.label && s.detail === x.detail; })[0]; return { label: x.label, detail: x.detail, edited: !!(old && old.edited) }; });
        }
        if (r.pulling) state.pulling = r.pulling;
        else if (r.options && state.pulling) r.pulling = state.pulling;
        if (r.options){
          if (state.lastOptions){ r.diff = diffOptions(state.lastOptions.reply.options, r.options); state.lastOptions.superseded = true; }
          state.lastOptions = pending;
        }
        done();
      }, function(e){ fail(pending, e || {}); });
  }
  // Ask the site's server (/api/chat) and read the reply as it arrives.
  // Resolves with the reply's fields, or rejects with { code, text }.
  function ask(turns, signal, onText){
    return fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: turns }), signal: signal
    }).then(function(res){
      if (!res.ok || !res.body){
        return res.json().catch(function(){ return {}; }).then(function(j){ throw { code: (j && j.error) || "upstream_error" }; });
      }
      var reader = res.body.getReader(), decoder = new TextDecoder(), buf = "", text = "", stop = null, err = null;
      function line(l){
        if (!l.trim()) return;
        var ev; try { ev = JSON.parse(l); } catch(e){ return; }
        if (ev.type === "text"){ text += ev.text; onText(text); }
        else if (ev.type === "end") stop = ev.stop;
        else if (ev.type === "error") err = ev.error || "upstream_error";
      }
      function pump(){
        return reader.read().then(function(chunk){
          if (chunk.done){
            line(buf);
            if (err) throw { code: err, text: text };
            if (stop === "refusal") throw { code: "refused" };
            if (stop === null) throw { code: "upstream_error", text: text };
            try { return JSON.parse(text); } catch(e){ throw { code: "invalid_json", text: text }; }
          }
          buf += decoder.decode(chunk.value, { stream: true });
          var parts = buf.split("\n"); buf = parts.pop();
          parts.forEach(line);
          return pump();
        });
      }
      return pump();
    }, function(e){
      throw { code: e && e.name === "AbortError" ? "cancelled" : "network" };
    }).catch(function(e){
      if (signal.aborted) throw { code: "cancelled" };
      throw e;
    });
  }
  function fail(pending, e){
    var code = e.code || "upstream_error";
    var idx = state.ui.indexOf(pending);
    if (code === "cancelled"){ if (idx >= 0) state.ui.splice(idx, 1); done(); return; }
    pending.thinking = false;
    var keep = code === "invalid_json" ? partialMessage(e.text) : "";
    pending.text = keep;
    if (code === "unavailable"){
      pending.error = "This page isn't able to answer right now. Please try again later."; pending.retry = true;
    } else if (code === "too_long"){
      state.blocked = true;
      pending.error = "This conversation has got too long for the page. Tap \"Start again\" to carry on.";
    } else if (code === "rate_limited"){
      pending.error = "Too many messages just now. Try again in a minute or two."; pending.retry = true;
    } else if (code === "busy"){
      pending.error = "Claude is busy just now. Try again in a moment."; pending.retry = true;
    } else if (code === "network"){
      pending.error = "Couldn't reach the page's server. Check your connection and try again."; pending.retry = true;
    } else if (code === "refused"){
      pending.text = ""; pending.error = "Claude couldn't answer that. Try putting it another way.";
    } else if (code === "invalid_json"){
      pending.error = keep ? "The rest of that reply came back in a shape the page couldn't read." : "That reply came back in a shape the page couldn't read."; pending.retry = true;
    } else {
      pending.error = "Something went wrong reaching Claude."; pending.retry = true;
    }
    done();
  }
  function done(){ clearInterval(state.timer); state.busy = false; state.ctl = null; render(true); }
  function okey(t){ return str(t).toLowerCase(); }
  function flat(it){ return { whyForYou: it.whyForYou, pros: it.pros.join("|"), cons: it.cons.join("|"), lookInto: it.lookInto.text + "|" + it.lookInto.service }; }
  function diffOptions(prev, next){
    var old = {}, seen = {};
    prev.items.forEach(function(it){ old[okey(it.title)] = flat(it); });
    var items = next.items.map(function(it){
      var k = okey(it.title), o = old[k]; seen[k] = true;
      if (!o) return { status: "new", fields: {} };
      var f = flat(it), ch = {}, any = false;
      for (var n in f) if (f[n] !== o[n]){ ch[n] = true; any = true; }
      return { status: any ? "updated" : "same", fields: ch };
    });
    return { items: items, dropped: prev.items.filter(function(it){ return !seen[okey(it.title)]; }).map(function(it){ return it.title; }) };
  }
  function retry(item){
    var i = state.ui.indexOf(item);
    if (i >= 0) state.ui.splice(i, 1);
    request();
  }

  // ---------- share ----------
  function shareText(r){
    var d = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    var L = ["Unstuck: my options (" + d + ")", ""];
    if (state.question) L.push("My question: " + state.question, "");
    if (state.said.length){ L.push("What I said:"); state.said.forEach(function(s){ L.push("- " + (s.label ? s.label + ": " : "") + s.detail); }); L.push(""); }
    var pl = r.pulling || state.pulling;
    if (pl){ L.push("What's pulling on this money (the usual order's view, as Claude reads it):"); pl.forEach(function(c){
      L.push("- " + [c.item, c.lead, c.usualOrder ? c.usualOrder.text : ""].filter(Boolean).join(" ") + (c.usualOrder && c.usualOrder.url ? " (" + c.usualOrder.url + ")" : "")); if (c.added) L.push("  Added: " + c.added); }); L.push(""); }
    L.push("Options:");
    r.options.items.forEach(function(it, i){
      L.push("", (i+1) + ". " + it.title);
      if (it.whyForYou) L.push("   Why it's on the table: " + it.whyForYou);
      if (it.pros.length) L.push("   Pros: " + it.pros.join("; "));
      if (it.cons.length) L.push("   Cons: " + it.cons.join("; "));
      if (it.lookInto.text || it.lookInto.service) L.push("   Look into: " + [it.lookInto.text, it.lookInto.service].filter(Boolean).join(" on ") + (it.lookInto.url ? " (" + it.lookInto.url + ")" : ""));
    });
    if (r.options.ruledOut.length) L.push("", "Not included: " + r.options.ruledOut.map(function(x){ return x.title + (x.reason ? " (" + x.reason + ")" : ""); }).join("; "));
    if (r.options.wouldChange) L.push("", "What would most change the picture: " + r.options.wouldChange);
    L.push("", "---", "Guidance, not financial advice. 'The usual order' is based on the r/UKPersonalFinance flowchart (https://ukpersonal.finance/flowchart/), CC BY-NC-SA 4.0. Nothing was saved by the page.");
    return L.join("\n");
  }
  function copyShare(r, holder){
    var t = shareText(r);
    var showBox = function(msg){
      holder.textContent = "";
      holder.appendChild(el("p", { cls: "small", text: msg }));
      var ta = el("textarea", { cls: "copybox", readonly: true, "aria-label": "Text to copy" });
      ta.value = t; holder.appendChild(ta); ta.focus(); ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){ holder.textContent = ""; holder.appendChild(el("p", { cls: "small", text: "Copied. Paste it into a message to yourself, a partner or a friend." })); },
        function(){ showBox("Select and copy the text below:"); });
    } else showBox("Select and copy the text below:");
  }
  function downloadShare(r, holder){
    try {
      var url = URL.createObjectURL(new Blob([shareText(r)], { type: "text/plain;charset=utf-8" }));
      var a = el("a", { href: url, download: "unstuck-options.txt" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    } catch(e){
      holder.textContent = ""; holder.appendChild(el("p", { cls: "small", text: "Couldn't download. Use Copy instead." }));
    }
  }

  // ---------- rendering ----------
  function icon(name, size){
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "icon" + (size ? " " + size : ""));
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || "";
    return s;
  }
  // A link that leaves Unstuck: always a new tab, so the conversation isn't lost.
  function extLink(href, text){
    return el("a", { href: href, target: "_blank", rel: "noopener" }, [text,
      el("span", { cls: "ext" }, [icon("external-link", "xs")]), el("span", { cls: "sr", text: " (opens in a new tab)" })]);
  }
  function btn(label, opts){
    opts = opts || {};
    return el("button", { cls: "btn" + (opts.cls ? " " + opts.cls : ""), type: "button", disabled: !!opts.disabled, onclick: opts.onclick, "aria-label": opts.aria || null },
      [opts.icon ? icon(opts.icon, opts.iconSize) : null, label]);
  }

  function renderStart(chat){
    var ex = el("div", { cls: "examples" });
    EXAMPLES.forEach(function(q){ ex.appendChild(el("button", { cls: "example", type: "button", onclick: function(){ send(q, "example"); } }, [el("span", { text: q }), icon("arrow-right")])); });
    chat.appendChild(el("div", { cls: "start" }, [
      el("h1", { text: "Got more than one thing wanting the same money?" }),
      el("p", { cls: "intro", text: "Talk it through. You'll be asked the questions that matter, see what's pulling on your money and what the usual order says about each, and get options with the trade-offs. It won't tell you what to do." }),
      el("p", { cls: "hint", text: "Tap an example, or tell me what's going on with your money below." }),
      ex
    ]));
  }
  // One sentence per claim, no boxes (12 Nov). The linked words are exactly the usual order's.
  function renderPulling(claims, live){
    var list = el("div", { cls: "clines" });
    claims.forEach(function(c){
      var uo = c.usualOrder, rule = null;
      if (uo) rule = uo.url
        ? el("a", { href: uo.url, target: "_blank", rel: "noopener" }, [uo.text, el("span", { cls: "ext" }, [icon("external-link", "xs")]), el("span", { cls: "sr", text: " (the usual order: " + uo.name + ", opens in a new tab)" })])
        : el("span", { text: uo.text });
      var row = el("div", { cls: "cline" + (c.added ? " added" : "") }, [
        el("div", { cls: "head" }, [el("p", null, [el("strong", { text: c.item }), c.lead ? " " + c.lead : "", rule ? " " : "", rule]),
          c.added ? el("span", { cls: "tag", text: "Added" }) : null])
      ]);
      if (c.added) row.appendChild(el("p", { cls: "why-added", text: c.added }));
      if (c.added && live) row.appendChild(el("div", null, [btn("I've got this covered", { cls: "sm", icon: "check", onclick: function(){ covered(c); } })]));
      list.appendChild(row);
    });
    return el("div", { cls: "pullb" }, [el("h2", { text: "What's pulling on this money" }), list,
      el("p", { cls: "caveat", text: "The usual order's view, as Claude reads it from what you've said." })]);
  }
  function covered(c){
    if (state.busy) return;
    state.said.push({ label: c.item, detail: "got this covered", edited: false });
    state.changes = ["Said they've got " + c.item + " covered"];
    send("I've got " + c.item.toLowerCase() + " covered.", "covered");
  }
  function chips(list, picked, live, onPick){
    return el("div", { cls: "choices" }, list.map(function(c){
      var isPicked = picked === c;
      return el("button", { cls: "chip" + (isPicked ? " picked" : ""), type: "button", disabled: !live, "aria-pressed": isPicked ? "true" : null,
        onclick: live ? function(){ onPick(c); } : null }, [isPicked ? icon("check") : null, c]);
    }));
  }
  function renderSharpen(sh, m, live){
    return el("div", { cls: "sharpen" }, [el("p", { text: sh.question }),
      sh.choices.length ? chips(sh.choices, m.pickedSharpen, live, function(c){ m.pickedSharpen = c; send(c, "sharpen"); }) : null,
      el("p", { cls: "caveat", text: "Answer to sharpen these options, or type below." })]);
  }
  function partList(k, arr, ic, changed){
    return el("div", { cls: "part" + (changed ? " chg" : "") }, [el("p", { cls: "label", text: k }),
      el("ul", null, arr.map(function(a){ return el("li", null, [el("span", { cls: "ic" }, [icon(ic, "sm")]), el("span", { text: a })]); }))]);
  }
  function renderOptions(r, m, live){
    var n = r.options.items.length;
    var g = el("div", { cls: "grid n" + n });
    r.options.items.forEach(function(it, i){
      var d = r.diff ? r.diff.items[i] : null, ch = d ? d.fields : {};
      var titleRow = el("div", { cls: "titlerow" }, [el("h3", { text: it.title }),
        d && d.status !== "same" ? el("span", { cls: "tag", text: d.status === "new" ? "New" : "Updated" }) : null]);
      var top = el("div", { cls: "top" }, [titleRow]);
      if (it.whyForYou) top.appendChild(el("p", { cls: "why" }, [ch.whyForYou ? el("mark", { cls: "chg", text: it.whyForYou }) : it.whyForYou]));
      var c = el("div", { cls: "card" }, [top]);
      if (it.pros.length || it.cons.length){
        var pc = el("div", { cls: "pc" });
        if (it.pros.length) pc.appendChild(partList("Pros", it.pros, "plus", ch.pros));
        if (it.pros.length && it.cons.length) pc.appendChild(el("div", { cls: "rule" }));
        if (it.cons.length) pc.appendChild(partList("Cons", it.cons, "minus", ch.cons));
        c.appendChild(pc);
      }
      var li = it.lookInto;
      if (li && (li.text || li.service)){
        var label = li.text && li.service ? li.text + " on " + li.service : (li.text || li.service);
        c.appendChild(el("p", { cls: "look" + (ch.lookInto ? " chg" : "") }, [li.url ? extLink(li.url, label) : el("span", { text: label })]));
      }
      g.appendChild(c);
    });
    var holder = el("div");
    return el("div", { cls: "section" }, [
      el("div", { cls: "opts-head" }, [el("h2", { cls: "h1", text: r.diff ? "Your options, updated" : "Your options" }),
        r.diff ? el("p", { cls: "caveat", text: "What changed since your last options is marked." }) : null]),
      g,
      r.options.ruledOut.length ? el("p", { cls: "ruled" }, [el("strong", { text: "Not included: " }), r.options.ruledOut.map(function(x){ return x.title + (x.reason ? " (" + x.reason + ")" : ""); }).join("; ")]) : null,
      r.diff && r.diff.dropped.length ? el("p", { cls: "ruled" }, [el("strong", { text: "No longer included: " }), r.diff.dropped.join("; ")]) : null,
      r.options.wouldChange ? el("p", { cls: "changer" }, [el("strong", { text: "What would most change the picture: " }), r.options.wouldChange]) : null,
      r.options.sharpen && (live || m.pickedSharpen) ? renderSharpen(r.options.sharpen, m, live) : null,
      el("div", { cls: "share" }, [
        el("span", { cls: "lbl", text: "Keep or share these options:" }),
        btn("Copy", { cls: "sm", icon: "copy", onclick: function(){ copyShare(r, holder); } }),
        btn("Download", { cls: "sm", icon: "download", onclick: function(){ downloadShare(r, holder); } })
      ]), holder]);
  }
  // Scroll rule (12 Nov): after they send and when the reply lands, put their last message at the top of the view,
  // just under You've said, so they never lose their place. They scroll down for the rest.
  function anchorLast(){
    var mine = $("chat").querySelectorAll(".msg.person");
    var lastMine = mine[mine.length - 1];
    if (!lastMine) return;
    var said = $("said"), offset = (said && !said.hidden ? said.offsetHeight : 0) + 8;
    // Empty gap under the conversation, just big enough that their message can reach the top
    // with the reply box still pinned to the bottom of the screen (12 Nov).
    var chat = $("chat"), gap = chat.querySelector(".gap");
    var chatEnd = chat.getBoundingClientRect().bottom - (gap ? gap.offsetHeight : 0);
    var need = window.innerHeight - offset - (chatEnd + $("composer").offsetHeight - lastMine.getBoundingClientRect().top);
    state.gap = Math.max(0, Math.ceil(need));
    if (gap) gap.style.height = state.gap + "px";
    var start = window.scrollY, y = Math.max(0, start + lastMine.getBoundingClientRect().top - offset);
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: y, behavior: still ? "auto" : "smooth" });
    // Some browsers skip smooth scrolling: if the page hasn't moved at all, jump there.
    setTimeout(function(){ if (Math.abs(window.scrollY - start) < 2 && Math.abs(y - start) > 2) window.scrollTo({ top: y }); }, 700);
  }
  function renderChat(scroll){
    var chat = $("chat");
    chat.textContent = "";
    if (!state.ui.length){ renderStart(chat); return; }
    var last = state.ui.length - 1;
    state.ui.forEach(function(m, i){
      if (m.who === "person"){ chat.appendChild(el("div", { cls: "msg person" }, [el("span", { cls: "text", text: m.text })])); return; }
      var r = m.reply, live = i === last && !state.busy;
      if (m.reflection) chat.appendChild(el("div", { cls: "msg reflection" }, [el("span", { cls: "text", text: m.reflection })]));
      if (m.thinking || (!m.text && !r && !m.error)){
        chat.appendChild(el("div", { cls: "msg claude" }, [el("span", { cls: "thinking", role: "status" }, [
          el("span", { cls: "dots", "aria-hidden": "true" }, [el("i"), el("i"), el("i")]), STATUS[m.statusSet || "ask"][m.statusIdx || 0] + "…"])]));
      } else if (r && r.options && !m.superseded){
        // The intro line goes inside the one results card below (12 Nov).
      } else if (m.text || r){
        var b = el("div", { cls: "msg claude" });
        if (m.text) b.appendChild(el("span", { cls: "text", text: m.text }));
        // Why I'm asking: label only, opens in place (12 Nov). Open state kept on the message so a re-render doesn't close it.
        if (r && r.why) b.appendChild(el("details", { cls: "note why", open: m.whyOpen ? true : null, ontoggle: function(e){ m.whyOpen = e.currentTarget.open; } }, [
          el("summary", null, [icon("circle-help", "sm"), el("span", { text: "Why I'm asking" }), el("span", { cls: "chev" }, [icon("chevron-down", "sm")])]),
          el("p", { text: r.why })]));
        if (r && r.notCovered) b.appendChild(el("div", null, [el("span", { cls: "notcovered" }, [icon("info", "sm"), "Not covered here: " + r.notCovered.topic + (r.notCovered.reason ? " (" + r.notCovered.reason + ")" : "")])]));
        chat.appendChild(b);
        // Answer buttons sit below the question card, and only while it's the live question (12 Nov):
        // once answered, the answer shows once, as their reply on the right.
        if (live && r && ((r.choices && r.choices.length) || r.skippable)) chat.appendChild(el("div", { cls: "answers" }, [
          r.choices && r.choices.length ? chips(r.choices, m.picked, live, function(c){ m.picked = c; send(c, "choice"); }) : null,
          r.skippable ? el("div", { cls: "skips" }, [btn("Skip this question", { cls: "quiet", icon: "skip-forward", iconSize: "sm", onclick: function(){ send("Skip this question.", "skip"); } })]) : null]));
      }
      if (r && r.options){
        if (m.superseded) chat.appendChild(el("p", { cls: "caveat superseded", text: "These options were updated further down." }));
        else {
          // The results in one card: intro line, what's pulling, options (12 Nov).
          chat.appendChild(el("div", { cls: "results" }, [m.text ? el("p", { cls: "intro-line", text: m.text }) : null,
            r.pulling ? renderPulling(r.pulling, live) : null, renderOptions(r, m, live)]));
        }
      }
      if (m.error){
        var n = el("div", { cls: "notice", role: "status" }, [el("span", { cls: "what" }, [icon("info", "sm"), el("span", { text: m.error })])]);
        if (m.retry && i === last) n.appendChild(btn("Try again", { cls: "sm", icon: "rotate-ccw", onclick: function(){ retry(m); } }));
        chat.appendChild(n);
      }
    });
    if (state.busy) chat.appendChild(el("div", { cls: "stoprow" }, [btn("Stop", { cls: "quiet", icon: "x", iconSize: "sm", onclick: function(){ if (state.ctl) state.ctl.abort(); } })]));
    chat.appendChild(el("div", { cls: "gap", "aria-hidden": "true", style: "height:" + (state.gap || 0) + "px" }));
    if (scroll) anchorLast();
  }

  // ---------- You've said ----------
  function saidSummary(){
    return state.said.map(function(s){ return (s.label ? s.label + " " : "") + s.detail; }).join(", ");
  }
  function editRow(label, value, aria, onSave){
    var inp = el("input", { type: "text", "aria-label": aria });
    inp.value = value;
    var save = function(){ onSave(str(inp.value)); };
    var cancel = function(){ state.editing = -1; render(); };
    inp.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); save(); } if (e.key === "Escape") cancel(); });
    setTimeout(function(){ inp.focus(); }, 0);
    return el("div", { cls: "sedit" }, [
      el("label", { cls: "fld" }, [el("span", { text: label }), el("span", { cls: "numfield" }, [inp])]),
      el("div", { cls: "acts" }, [btn("Save", { cls: "sm", icon: "check", onclick: save }),
        el("button", { cls: "textlink", type: "button", text: "Cancel", onclick: cancel })])
    ]);
  }
  function renderSaid(){
    var s = $("said");
    var show = state.said.length > 0 || !!state.question || state.changes.length > 0;
    s.hidden = !show;
    s.textContent = "";
    if (!show) return;
    // Starts closed on every screen (10 Nov): open and sticky, it covered half a wide window and the option cards ran under it.
    if (state.saidOpen === null) state.saidOpen = false;
    var open = state.saidOpen;
    var toggle = function(){ state.saidOpen = !state.saidOpen; state.editing = -1; render(); };
    // Closed: a one-line summary. Open: the rows say it all (the question is the first row), so no line here.
    // Closed: the question leads, then what they've said (12 Nov).
    var sub = open ? "" : [state.question, saidSummary()].filter(Boolean).join(", ");
    var head = el("div", { cls: "head", onclick: function(e){ if (!e.target.closest("button")) toggle(); } }, [
      el("div", null, [el("span", { cls: "label", text: "You've said" }), sub ? el("p", { cls: "sum", text: sub }) : null]),
      el("button", { cls: "iconbtn", type: "button", "aria-expanded": open ? "true" : "false", "aria-label": open ? "Hide what you've said" : "Show what you've said", onclick: toggle }, [icon(open ? "chevron-up" : "chevron-down")])
    ]);
    var box = el("div", { cls: "saidbox" }, [head]);
    if (open){
      var rows = el("div", { cls: "rows" });
      if (state.question){
        if (state.editing === "q"){
          rows.appendChild(editRow("Your question", state.question, "Edit your question", function(v){
            if (v && v !== state.question){ state.changes.push("Changed their question to \"" + v + "\""); state.question = v; }
            state.editing = -1; render();
          }));
        } else {
          rows.appendChild(el("div", { cls: "srow" }, [
            el("div", { cls: "body" }, [el("span", { cls: "label", text: "Your question" }), el("p", { cls: "detail", text: state.question })]),
            el("button", { cls: "iconbtn", type: "button", disabled: state.busy, "aria-label": "Edit your question", onclick: function(){ state.editing = "q"; render(); } }, [icon("pencil")])
          ]));
        }
      }
      state.said.forEach(function(item, i){
        if (state.editing === i){
          rows.appendChild(editRow(item.label || "Detail", item.detail, "Edit " + (item.label || "this item"), function(v){
            if (v && v !== item.detail){ state.changes.push("Changed " + (item.label || "an item") + " from \"" + item.detail + "\" to \"" + v + "\""); item.detail = v; item.edited = true; }
            state.editing = -1; render();
          }));
          return;
        }
        var name = item.label || item.detail;
        rows.appendChild(el("div", { cls: "srow" }, [
          // All rows in the same body style (12 Nov): sizing by "has a number" read as random.
          el("div", { cls: "body" }, [item.label ? el("span", { cls: "label", text: item.label }) : null,
            el("p", { cls: "detail" }, [el("span", { text: item.detail }), item.edited ? el("span", { cls: "edited", text: " (edited)" }) : null])]),
          el("button", { cls: "iconbtn", type: "button", disabled: state.busy, "aria-label": "Edit " + name, onclick: function(){ state.editing = i; render(); } }, [icon("pencil")]),
          el("button", { cls: "iconbtn", type: "button", disabled: state.busy, "aria-label": "Remove " + name, onclick: function(){
            state.changes.push("Removed " + (item.label ? item.label + " (" + item.detail + ")" : "\"" + item.detail + "\"")); state.said.splice(i, 1); render(); } }, [icon("x")])
        ]));
      });
      box.appendChild(rows);
    }
    if (state.changes.length){
      box.appendChild(el("div", { cls: "pending" }, [
        el("span", { text: "You've changed this list." }),
        btn("Update with my changes", { cls: "sm", disabled: state.busy, onclick: function(){ send("I've changed what I've said.", "update", "I've updated what I've said."); } })
      ]));
    }
    s.appendChild(box);
  }
  function render(scroll){
    renderSaid();
    renderChat(scroll);
    var started = state.ui.length > 0;
    var replied = state.ui.some(function(m){ return m.who === "claude" && m.reply; });
    // Hidden once options are on screen (12 Nov).
    var hasOptions = state.ui.some(function(m){ return m.reply && m.reply.options; });
    $("optsNow").hidden = !replied || hasOptions;
    $("optsNow").disabled = state.busy || state.blocked;
    $("send").disabled = state.busy || state.blocked || !str($("box").value);
    $("restart").hidden = !started;
  }

  // ---------- wiring ----------
  var box = $("box");
  function autosize(){ box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 160) + "px"; }
  box.addEventListener("input", function(){ autosize(); $("send").disabled = state.busy || state.blocked || !str(box.value); });
  box.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); $("form").requestSubmit(); } });
  $("form").addEventListener("submit", function(e){ e.preventDefault(); var t = box.value; if (!str(t) || state.busy || state.blocked) return; box.value = ""; autosize(); send(t, "message"); });
  $("optsNow").addEventListener("click", function(){ send("Show me options now.", "options_now"); });
  $("restart").addEventListener("click", function(){
    if (state.ctl) state.ctl.abort();
    state.turns = []; state.ui = []; state.said = []; state.question = ""; state.ctxOpen = false; state.changes = []; state.pulling = null; state.lastOptions = null; state.editing = -1; state.busy = false; state.blocked = false; state.gap = 0;
    render(); window.scrollTo({ top: 0 });
  });
  render();
})();
