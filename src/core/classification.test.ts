import { describe, expect, it } from 'vitest';
import { classifyLifecycle, progressPercent } from './classification';

describe('OpenSpec lifecycle classification', () => {
  it('keeps missing and untouched task lists in not-started', () => {
    expect(classifyLifecycle({ completedTasks: 0, totalTasks: 0 })).toBe('not-started');
    expect(classifyLifecycle({ completedTasks: 0, totalTasks: 12 })).toBe('not-started');
  });

  it('classifies partial and completed task progress', () => {
    expect(classifyLifecycle({ completedTasks: 3, totalTasks: 12 })).toBe('partial');
    expect(classifyLifecycle({ completedTasks: 12, totalTasks: 12 })).toBe('completed');
  });

  it('clamps progress and handles an empty task list', () => {
    expect(progressPercent(3, 4)).toBe(75);
    expect(progressPercent(8, 4)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});
