export const RUBRICS = {
  "Literary Arts": {
    subPathways: {
      Poetry: { round1: { type: "numeric", criteria: [
        { key: "delivery", label: "Delivery & Pronunciation", weight: 0.2, max: 100 },
        { key: "expression", label: "Expression & Emotion", weight: 0.2, max: 100 },
        { key: "presence", label: "Presence & Confidence", weight: 0.2, max: 100 },
        { key: "rhythm", label: "Rhythm & Flow", weight: 0.2, max: 100 },
        { key: "impact", label: "Overall Impact", weight: 0.2, max: 100 }
      ] } },
      "Short Stories": { round1: { type: "numeric", criteria: [
        { key: "language", label: "Language & Style", weight: 0.2, max: 100 },
        { key: "characters", label: "Character Development", weight: 0.2, max: 100 },
        { key: "plot", label: "Plot & Coherence", weight: 0.25, max: 100 },
        { key: "creativity", label: "Creativity & Originality", weight: 0.2, max: 100 },
        { key: "impact", label: "Reader Impact", weight: 0.15, max: 100 }
      ] } },
      Playwriting: { round1: { type: "numeric", criteria: [
        { key: "dialogue", label: "Dialogue & Language", weight: 0.2, max: 100 },
        { key: "characters", label: "Character Development", weight: 0.2, max: 100 },
        { key: "plot", label: "Plot & Dramatic Structure", weight: 0.25, max: 100 },
        { key: "creativity", label: "Creativity", weight: 0.2, max: 100 },
        { key: "impact", label: "Audience Impact", weight: 0.15, max: 100 }
      ] } }
    },
    round1: { type: "numeric", criteria: [
      { key: "language", label: "Language & Style", weight: 0.2, max: 100 },
      { key: "creativity", label: "Creativity & Originality", weight: 0.2, max: 100 },
      { key: "structure", label: "Structure", weight: 0.2, max: 100 },
      { key: "impact", label: "Impact", weight: 0.2, max: 100 },
      { key: "clarity", label: "Clarity", weight: 0.2, max: 100 }
    ] },
    round2: { type: "numeric", criteria: [
      { key: "language_quality", label: "Language Quality", weight: 0.25, max: 100 },
      { key: "creativity", label: "Creativity", weight: 0.25, max: 100 },
      { key: "imagery", label: "Imagery & Expression", weight: 0.2, max: 100 },
      { key: "structure", label: "Structure & Coherence", weight: 0.15, max: 100 },
      { key: "impact", label: "Audience Impact", weight: 0.15, max: 100 }
    ] }
  },
  "Performing Arts": {
    round1: { type: "numeric", criteria: [
      { key: "performance", label: "Performance Quality", weight: 0.3, max: 100 },
      { key: "identity", label: "National Identity Expression", weight: 0.25, max: 100 },
      { key: "creativity", label: "Creativity", weight: 0.2, max: 100 },
      { key: "presence", label: "Stage Presence", weight: 0.15, max: 100 },
      { key: "harmony", label: "Harmony / Coordination", weight: 0.1, max: 100 }
    ] },
    round2: { type: "numeric", criteria: [
      { key: "performance", label: "Performance Quality", weight: 0.3, max: 100 },
      { key: "identity", label: "National Identity Expression", weight: 0.25, max: 100 },
      { key: "creativity", label: "Creativity", weight: 0.2, max: 100 },
      { key: "presence", label: "Stage Presence", weight: 0.15, max: 100 },
      { key: "harmony", label: "Harmony / Coordination", weight: 0.1, max: 100 }
    ] }
  },
  "Visual Arts": {
    round1: { type: "grade", criteria: [
      { key: "quality", label: "Overall Quality", weight: 0.45, max: 100 },
      { key: "creativity", label: "Creativity & Imagination", weight: 0.4, max: 100 },
      { key: "personality", label: "Personality & Age Level", weight: 0.1, max: 100 },
      { key: "presentation", label: "Presentation & Effort", weight: 0.05, max: 100 }
    ] },
    round2: { type: "grade_with_identity", criteria: [
      { key: "identity", label: "National Identity", binary: true, weight: 0 },
      { key: "quality", label: "Overall Quality", weight: 0.45, max: 100 },
      { key: "creativity", label: "Creativity & Imagination", weight: 0.35, max: 100 },
      { key: "personality", label: "Personality & Age Level", weight: 0.15, max: 100 },
      { key: "presentation", label: "Presentation & Effort", weight: 0.05, max: 100 }
    ] }
  },
  "Applied Arts": {
    round1: { type: "grade", criteria: [
      { key: "function", label: "Design Function", weight: 0.35, max: 100 },
      { key: "execution", label: "Technical Execution", weight: 0.35, max: 100 },
      { key: "concept", label: "Concept Clarity", weight: 0.2, max: 100 },
      { key: "personality", label: "Age-Level Fit", weight: 0.1, max: 100 }
    ] },
    round2: { type: "grade_with_identity", criteria: [
      { key: "identity", label: "National Identity", binary: true, weight: 0 },
      { key: "function", label: "Design Function", weight: 0.3, max: 100 },
      { key: "execution", label: "Technical Execution", weight: 0.4, max: 100 },
      { key: "concept", label: "Concept Clarity", weight: 0.15, max: 100 },
      { key: "presentation", label: "Presentation", weight: 0.15, max: 100 }
    ] }
  },
  "Digital Arts": {
    round1: { type: "grade", criteria: [
      { key: "technical", label: "Technical Execution", weight: 0.35, max: 100 },
      { key: "innovation", label: "Innovation", weight: 0.45, max: 100 },
      { key: "personality", label: "Age-Level Fit", weight: 0.1, max: 100 },
      { key: "originality", label: "Original Work Review", weight: 0.1, max: 100 }
    ] },
    round2: { type: "grade_with_identity", criteria: [
      { key: "identity", label: "National Identity", binary: true, weight: 0 },
      { key: "technical", label: "Technical Execution", weight: 0.35, max: 100 },
      { key: "innovation", label: "Innovation", weight: 0.35, max: 100 },
      { key: "originality", label: "Original Work Review", weight: 0.2, max: 100 },
      { key: "personality", label: "Age-Level Fit", weight: 0.1, max: 100 }
    ] }
  }
};

export function getRubric(pathway, subPathway, roundKey) {
  const config = RUBRICS[pathway];
  if (!config) return null;
  if (config.subPathways?.[subPathway]?.[roundKey]) return config.subPathways[subPathway][roundKey];
  return config[roundKey] || null;
}
