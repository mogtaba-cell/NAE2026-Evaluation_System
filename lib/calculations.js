export function calculateSingleEvaluator(rubric, scores = {}) {
  if (!rubric) return { totalScore: 0, grade: '', identityValue: null };
  let total = 0;
  let identityValue = null;
  for (const criterion of rubric.criteria) {
    const raw = scores?.[criterion.key];
    if (criterion.binary) {
      identityValue = raw === 100 ? 100 : 0;
    } else {
      total += Number(raw || 0) * Number(criterion.weight || 0);
    }
  }
  const totalScore = Math.ceil(total);
  const grade = ['grade', 'grade_with_identity'].includes(rubric.type)
    ? totalScore >= 80 ? 'A' : totalScore >= 50 ? 'B' : 'C'
    : '';
  return { totalScore, grade, identityValue };
}

export function calculateAggregate(roundState, rubric, evaluatorNames = {}) {
  if (!rubric) return { totalScore: 0, grade: '', identityValue: null, scoredBy: 0, commentsSummary: '' };
  const ids = roundState.evaluator_ids || [];
  const active = ids.filter((id) => {
    const item = roundState.per_evaluator?.[id] || {};
    return Object.keys(item.scores || {}).length > 0 || String(item.comments || '').trim() !== '';
  });
  if (!active.length) return { totalScore: 0, grade: '', identityValue: null, scoredBy: 0, commentsSummary: '' };

  const rows = active.map((id) => {
    const item = roundState.per_evaluator?.[id] || {};
    return { id, ...calculateSingleEvaluator(rubric, item.scores || {}), comments: item.comments || '' };
  });

  const totalScore = Math.ceil(rows.reduce((sum, row) => sum + Number(row.totalScore || 0), 0) / rows.length);
  const identityValue = rubric.type === 'grade_with_identity'
    ? Math.ceil(rows.reduce((sum, row) => sum + Number(row.identityValue || 0), 0) / rows.length)
    : null;
  const grade = ['grade', 'grade_with_identity'].includes(rubric.type)
    ? totalScore >= 80 ? 'A' : totalScore >= 50 ? 'B' : 'C'
    : '';
  const commentsSummary = rows
    .filter((row) => String(row.comments).trim())
    .map((row) => `${evaluatorNames[row.id] || row.id}: ${row.comments}`)
    .join('\n');

  return { totalScore, grade, identityValue, scoredBy: rows.length, commentsSummary };
}

export function passesRound1(pathway, effective) {
  if (['Literary Arts', 'Performing Arts'].includes(pathway)) return Number(effective?.totalScore || 0) >= 75;
  return ['A', 'B'].includes(effective?.grade || '');
}

export function isFinalSelected(pathway, effective) {
  if (['Literary Arts', 'Performing Arts'].includes(pathway)) return Number(effective?.totalScore || 0) >= 75;
  return Number(effective?.identityValue || 0) === 100 && ['A', 'B'].includes(effective?.grade || '');
}
