import Script from "next/script";

// Lucide icons (lucide.dev, ISC licence), drawn inline. public/app.js draws the rest.
function Icon({ size = 20, className = "icon", children }: { size?: number; className?: string; children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  );
}
function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {children}
      <span className="ext">
        <Icon size={14} className="icon xs"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>
      </span>
      <span className="sr"> (opens in a new tab)</span>
    </a>
  );
}

// The page's frame. public/app.js fills in the conversation and runs the chat.
export default function Home() {
  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">unstuck</div>
        <button className="btn sm" id="restart" type="button" hidden>
          <Icon><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Icon>
          Start again
        </button>
      </div>
      <section id="said" hidden aria-label="What you've said"></section>
      <main id="chat" aria-live="polite"></main>
      <section id="composer">
        <form className="inrow" id="form">
          <label className="sr" htmlFor="box">
            Your message
          </label>
          <textarea id="box" rows={1} placeholder="Reply" maxLength={2000}></textarea>
          <button className="send" id="send" type="submit" aria-label="Send" disabled>
            <Icon size={24} className="icon lg"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" /><path d="M6 12h16" /></Icon>
          </button>
        </form>
        <div className="tools">
          <button className="btn" id="optsNow" type="button" hidden>
            <Icon><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>
            Show me options now
          </button>
        </div>
      </section>
      <footer className="credit">
        <p>Guidance, not financial advice. It won&apos;t tell you what to do or name products.</p>
        <p>
          What you type is sent to Claude, Anthropic&apos;s AI, to write the replies. This site doesn&apos;t save it, and
          Anthropic doesn&apos;t keep it either unless its automated safety checks flag it.
        </p>
        <p>
          &quot;The usual order&quot; is based on the{" "}
          <External href="https://ukpersonal.finance/flowchart/">r/UKPersonalFinance flowchart</External> and wiki, by
          members of the UKPF community, used under{" "}
          <External href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</External>.
        </p>
      </footer>
      <Script src="/app.js" strategy="afterInteractive" />
    </div>
  );
}
