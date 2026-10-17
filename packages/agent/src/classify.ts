import type { SafetyFindings } from './safety';
import type { Classification } from './types';

/**
 * Keyword heuristics for intent and language. Used by the offline model and as the fallback
 * when the router model is unavailable. Deliberately conservative: when unsure, "general".
 */
const INTENT_RULES: [Classification['intent'], RegExp][] = [
  // In South Africa "the register" usually means attendance, so check that first.
  [
    'attendance',
    /\b(attendance|(take|mark|do|fill in) (the |today'?s )?register|absent today|present today)\b/i,
  ],
  [
    'registration',
    /\b(registration|registered|register (my|our|the) (centre|center|creche|cr[eè]che|ecd)|dbe|subsidy|norms?|standards?|compliance|certificate|zoning|fire (safety|certificate)|polic(y|ies)|application pack|district office|ncf|elda)\b/i,
  ],
  ['printable', /\b(print(able|out)?s?|worksheets?|flash ?cards?|colouring|poster)\b/i],
  [
    'planning',
    /\b(plan|planning|theme|activit(y|ies)|lesson|curriculum|routine|daily programme|ideas? for|rainy day)\b/i,
  ],
  [
    'behaviour',
    /\b(behaviou?r|tantrum|biting|bites|hitting other|won'?t listen|naughty|discipline|aggressive|crying all day)\b/i,
  ],
  [
    'child_progress',
    /\b(progress|milestones?|development(al)?|observation|report card|assessment)\b/i,
  ],
];

const ECD_HINT =
  /\b(child|children|kids?|toddler|baby|babies|parent|centre|center|creche|cr[eè]che|educare|daycare|day care|practitioner|teacher|class|learner|ecd|grade r)\b/i;
const OFF_TOPIC =
  /\b(cover letter|cv\b|resume|crypto|bitcoin|bet(ting)?|lotto|football|soccer score|recipe for|write (me )?a (poem|song|story) about (love|my)|homework for my (son|daughter) in grade (\d{2}|[4-9]))\b/i;

const LANGUAGE_RULES: [Classification['language'], RegExp][] = [
  ['af', /\b(die|en|ek|hoe|wat|kinders|kind|asseblief|dankie|ons|vir|het|nie)\b/gi],
  ['xh', /\b(molo|enkosi|ndi\w*|umntwana|abantwana|kakhulu|ewe|hayi|ndiyacela|njani)\b/gi],
  ['zu', /\b(sawubona|ngiyabonga|ngi\w*|ingane|izingane|kakhulu|yebo|cha|ngicela|kanjani)\b/gi],
];

export function detectLanguage(text: string): Classification['language'] {
  let best: Classification['language'] = 'en';
  let bestScore = 1;
  for (const [lang, re] of LANGUAGE_RULES) {
    const score = text.match(re)?.length ?? 0;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

export function heuristicClassify(text: string, safety: SafetyFindings): Classification {
  let intent: Classification['intent'] = 'general';
  for (const [name, re] of INTENT_RULES) {
    if (re.test(text)) {
      intent = name;
      break;
    }
  }
  if (safety.diagnosisRequest && intent === 'general') intent = 'child_progress';
  if (intent === 'general' && OFF_TOPIC.test(text) && !ECD_HINT.test(text)) intent = 'off_topic';
  return {
    intent,
    language: detectLanguage(text),
    risk: safety.risk,
    needsSources: intent === 'registration' || /\b(ncf|elda|national curriculum)\b/i.test(text),
  };
}
