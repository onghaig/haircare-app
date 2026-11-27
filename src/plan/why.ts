import type { TaskId } from './tasks';

/**
 * What each daily task does for the forecast, in a few words (forecast-by-action design).
 * "counts" says whether the forecast uses it.
 */
export const TASK_WHY: Record<TaskId, { text: string; counts: boolean }> = {
  finasteride: { text: '= Slows loss. Works best taken every day', counts: true },
  dutasteride: { text: '= Slows loss. Works best taken every day', counts: true },
  minoxidil: { text: '↑ Grows hair. Only works while you use it', counts: true },
  oralMinoxidil: { text: '↑ Grows hair. Only works while you take it', counts: true },
  massage: { text: '↑ Grows hair. Small effect, low risk', counts: true },
  ketoconazole: { text: '○ Scalp care. Not in your forecast', counts: false },
  quickLog: { text: '○ Explains shedding. Not in your forecast', counts: false },
  scan: { text: '○ Checks your forecast against real change', counts: false },
};
