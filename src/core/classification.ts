import type { LifecycleState } from '../shared/protocol';

export interface ChangeProgressInput {
  completedTasks?: number;
  totalTasks?: number;
  status?: string;
}

export function classifyLifecycle(input: ChangeProgressInput): LifecycleState {
  const completed = normalizedCount(input.completedTasks);
  const total = normalizedCount(input.totalTasks);

  if (total > 0 && completed >= total) {
    return 'completed';
  }
  if (completed > 0) {
    return 'partial';
  }
  return 'not-started';
}

export function progressPercent(completedTasks: number, totalTasks: number): number {
  const completed = normalizedCount(completedTasks);
  const total = normalizedCount(totalTasks);
  if (total === 0) {
    return 0;
  }
  return Math.min(100, Math.round((completed / total) * 100));
}

function normalizedCount(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
}
