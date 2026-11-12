// The shape every reply from Claude must follow (the "fields").
// The API enforces this shape, so the page can always read the reply.
// It matches "HOW YOU REPLY" in lib/instructions.md: change both together.

const WIKI_PAGES = [
  "/budgeting/", "/benefit-entitlement/", "/insurance/", "/debt/", "/emergency-fund/", "/pensions/",
  "/goals/", "/savings/", "/student-loans/", "/mortgage-overpayments/", "/isa-vs-lisa-vs-pension/",
  "/investing-101/", "",
];

const text = { type: "string" };
const textList = { type: "array", items: text };
const nullOr = (shape: object) => ({ anyOf: [{ type: "null" }, shape] });

// One rule from the usual order, with the wiki page it comes from (the page turns it into a link).
const rule = {
  type: "object",
  properties: { text, page: { type: "string", enum: WIKI_PAGES } },
  required: ["text", "page"],
  additionalProperties: false,
};

// The services an option can point to. The page holds their web addresses (public/app.js, SERVICES).
const SERVICES = [
  "MoneySavingExpert", "MoneyHelper", "Pension Wise", "StepChange", "National Debtline", "Citizens Advice",
  "Christians Against Poverty", "Debt Camel", "entitledto", "Turn2us", "GamCare", "Surviving Economic Abuse",
  "Macmillan", "",
];

const option = {
  type: "object",
  properties: {
    title: text,
    whyForYou: text,
    pros: textList,
    cons: textList,
    lookInto: {
      type: "object",
      properties: { text, service: { type: "string", enum: SERVICES } },
      required: ["text", "service"],
      additionalProperties: false,
    },
  },
  required: ["title", "whyForYou", "pros", "cons", "lookInto"],
  additionalProperties: false,
};

// One thing competing for the money, shown in "What's pulling on this money" as one sentence (12 Nov):
// "item" in bold, then "lead", then the usual order's rule as a link, so the linked words are exactly the
// usual order's. Their figures stay in You've said.
const claim = {
  type: "object",
  properties: { item: text, lead: text, usualOrder: rule, added: text },
  required: ["item", "lead", "usualOrder", "added"],
  additionalProperties: false,
};

export const replySchema = {
  type: "object",
  properties: {
    // "reflection" and "message" come first so the page can show them while the rest is still arriving.
    reflection: text,
    message: text,
    why: text,
    skippable: { type: "boolean" },
    choices: textList,
    youveSaid: {
      type: "object",
      properties: {
        question: text,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { label: text, detail: text },
            required: ["label", "detail"],
            additionalProperties: false,
          },
        },
      },
      required: ["question", "items"],
      additionalProperties: false,
    },
    pulling: nullOr({
      type: "object",
      properties: { claims: { type: "array", items: claim } },
      required: ["claims"],
      additionalProperties: false,
    }),
    options: nullOr({
      type: "object",
      properties: {
        items: { type: "array", items: option },
        wouldChange: text,
        ruledOut: {
          type: "array",
          items: {
            type: "object",
            properties: { title: text, reason: text },
            required: ["title", "reason"],
            additionalProperties: false,
          },
        },
        sharpen: nullOr({
          type: "object",
          properties: { question: text, choices: textList },
          required: ["question", "choices"],
          additionalProperties: false,
        }),
      },
      required: ["items", "wouldChange", "ruledOut", "sharpen"],
      additionalProperties: false,
    }),
    notCovered: nullOr({
      type: "object",
      properties: { topic: text, reason: text },
      required: ["topic", "reason"],
      additionalProperties: false,
    }),
  },
  required: ["reflection", "message", "why", "skippable", "choices", "youveSaid", "pulling", "options", "notCovered"],
  additionalProperties: false,
};
