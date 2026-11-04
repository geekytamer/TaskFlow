import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayKey, monthGrid, tasksByDay, weekStart, workload } from './task-planning';

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, status: 'To Do', assignedUserIds: ['u1'], estimateMinutes: null, loggedMinutes: 0, ...extra,
}) as never;

describe('task planning', () => {
  it('builds a month grid of whole weeks starting Monday', () => {
    const grid = monthGrid(new Date(2026, 10, 15)); // November 2026
    assert.equal(grid.length % 7, 0);
    assert.equal(grid[0].getDay(), 1, 'Monday');
    assert.equal(dayKey(grid[0]), '2026-10-26');
    assert.ok(grid.some((d) => dayKey(d) === '2026-11-30'));
  });

  it('puts a task on every day from its start to its due date, or on its due day', () => {
    const days = tasksByDay([
      task('span', { startDate: new Date(2026, 10, 2), dueDate: new Date(2026, 10, 4, 17) }),
      task('one', { dueDate: new Date(2026, 10, 3) }),
      task('none'),
    ]);
    assert.deepEqual(days.get('2026-11-02')?.map((t) => t.id), ['span']);
    assert.deepEqual(days.get('2026-11-03')?.map((t) => t.id), ['span', 'one']);
    assert.deepEqual(days.get('2026-11-04')?.map((t) => t.id), ['span']);
    assert.equal(days.get('2026-11-05'), undefined);
  });

  it('weekStart is Monday, local time', () => {
    assert.equal(dayKey(weekStart(new Date(2026, 10, 8))), '2026-11-02', 'Sunday');
    assert.equal(dayKey(weekStart(new Date(2026, 10, 9))), '2026-11-09');
  });

  it('workload: remaining estimate per person per week, overdue counted in the first week, shared tasks split', () => {
    const now = new Date(2026, 10, 4);
    const rows = workload([
      task('a', { dueDate: new Date(2026, 10, 5), estimateMinutes: 600, loggedMinutes: 120 }),
      task('late', { dueDate: new Date(2026, 9, 20), estimateMinutes: 60 }),
      task('next', { dueDate: new Date(2026, 10, 12), estimateMinutes: 240, assignedUserIds: ['u1', 'u2'] }),
      task('noEstimate', { dueDate: new Date(2026, 10, 6) }),
      task('done', { status: 'Done', dueDate: new Date(2026, 10, 5), estimateMinutes: 999 }),
    ], now, 2);
    const u1 = rows.find((r) => r.userId === 'u1')!;
    assert.equal(u1.weeks[0].minutes, 480 + 60, 'this week: what is left of a, plus the overdue one');
    assert.equal(u1.weeks[0].tasks.length, 3);
    assert.equal(u1.weeks[0].unestimated, 1);
    assert.equal(u1.weeks[1].minutes, 120, 'half of a shared estimate');
    assert.equal(rows.find((r) => r.userId === 'u2')!.weeks[1].minutes, 120);
  });
});
