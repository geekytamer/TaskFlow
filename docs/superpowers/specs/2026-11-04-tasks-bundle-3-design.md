# Tasks bundle 3: estimates, calendar, workload, weekly report

The owner said "do them all" (2026-11-04) and wants decisions made without questions. Decisions:

- **Estimates.** Each task has an optional estimate (`tasks.estimateMinutes`, 1 minute to 1000 hours), entered in hours in the task's Time panel. The panel shows time logged against it and what is left, and turns amber once logged time goes over. A shared task's estimate is split evenly between its people.
- **When a task was finished.** `tasks.completedAt` is kept by database triggers, whichever path changes the status (edit, parts, recurrence, bulk). Reopening a task clears it.
  - Tasks that were already done get the time of the last activity entry that recorded them as Done, where the log has one.
- **Logged time.** Every task read now carries `loggedMinutes`.
- **Tasks page views:** List | Calendar | Workload | Week. The view is in the URL as `?view=`.
  - **Calendar:** a month grid with each task on every day from its start to its due date (or only on its due day), "My tasks" or "Everyone", and clicking a task opens it. On a phone it becomes an agenda of the days that have tasks.
  - **Workload:** for each person, the next 4 weeks. Each cell shows what is left of their estimates (estimate minus logged) in the week the work is due, with overdue work counted in this week. More than 40 hours in a week is shown in amber. Tasks with no estimate are counted and flagged. Clicking a cell lists its tasks.
  - **Week:** the weekly report for one company. For each person: what they finished that week, what is due and still open, what is overdue, and the time they logged. Only tasks the reader can see are included (`GET /companies/:id/tasks/week?start=`), so private tasks and the time logged on them stay private.
- **Monday summary.** From 04:00 UTC on Monday (08:00 in Oman), Admins and Managers who can see all tasks get one notification per company with last week's numbers, linking to that week's report.
  - Private tasks are left out of the counts. It is sent once per week, tracked in `task_week_reports`.
- Migration `160_task_estimates_completion`.
