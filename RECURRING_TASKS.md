# Recurring Tasks Documentation

## Overview

The Task Manager plugin now supports powerful recurring tasks that automatically generate future instances based on customizable patterns.

## Recurring Task Format

### Basic Structure

```markdown
- [ ] Task name recurring::1day starting::2025-01-01 ending::never due::2025-01-01 eta::1:00 #tlog/project
```

### Required Fields

1. **recurring::** - Defines the recurrence pattern
   - Format: `recurring::<number><unit>`
   - Units: `day`, `week`, `month`, `year`
   - Examples: `recurring::1day`, `recurring::2week`, `recurring::3month`

### Optional Fields

2. **starting::** - When the recurrence begins
   - Format: `starting::YYYY-MM-DD`
   - Default: Today's date if not specified
   - Example: `starting::2025-01-15`

3. **ending::** - When the recurrence stops
   - Format: `ending::YYYY-MM-DD` or `ending::never`
   - Default: Never ends if not specified
   - Examples: `ending::2025-12-31` or `ending::never`

4. **due::** - Initial due date (standard field)
   - Used as reference for calculating occurrences

## Recurrence Patterns

### Daily Recurrence

Repeat every N days:

```markdown
- [ ] Daily standup recurring::1day starting::2025-01-01 due::2025-01-01 eta::0:15 #tlog/work/meetings
```

Every 2 days:
```markdown
- [ ] Water plants recurring::2day starting::2025-01-01 due::2025-01-01 eta::0:30 #tlog/chores/home
```

### Weekly Recurrence

Repeat every N weeks on specific days:

```markdown
- [ ] Team meeting recurring::1week wday::[monday,wednesday] starting::2025-01-01 due::2025-01-06 eta::1:00 #tlog/work/meetings
```

**wday::** - Days of the week for occurrence
- Format: `wday::[day1,day2,...]`
- Valid days: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`
- Multiple days: `wday::[monday,tuesday,friday]`

Every 2 weeks on Monday:
```markdown
- [ ] Biweekly review recurring::2week wday::[monday] starting::2025-01-01 due::2025-01-06 #tlog/work
```

### Monthly Recurrence

Repeat every N months on specific days of the month:

```markdown
- [ ] Pay rent recurring::1month day::[1] starting::2025-01-01 due::2025-01-01 eta::0:15 #tlog/personal/finance
```

**day::** - Days of the month for occurrence
- Format: `day::[day1,day2,...]`
- Values: 1-31 (day of month)
- Multiple days: `day::[1,15,30]`

Multiple days per month:
```markdown
- [ ] Backup data recurring::1month day::[1,15] starting::2025-01-01 due::2025-01-01 eta::0:30 #tlog/work/admin
```

### Yearly Recurrence

Repeat every N years on specific dates:

```markdown
- [ ] Renew license recurring::1year month::[12-01] starting::2025-12-01 due::2025-12-01 eta::1:00 #tlog/personal
```

**month::** - Specific dates (MM-DD format) for occurrence
- Format: `month::[mm-dd,mm-dd,...]`
- Values: `MM-DD` format (e.g., `12-01` for December 1st)
- Multiple dates: `month::[12-01,02-27]`

Multiple dates per year:
```markdown
- [ ] Tax payment recurring::1year month::[04-15,10-15] starting::2025-01-01 due::2025-04-15 #tlog/personal/finance
```

## How Recurring Tasks Work

### Virtual Future Tasks

- Recurring tasks generate **virtual** future occurrences automatically
- These virtual tasks appear in timeline views but DON'T exist in the tasks.md file
- They show when tasks are due in custom timeline views (Next 7 Days, etc.)

### Materialized Tasks

The plugin automatically creates actual task entries in tasks.md when:

1. **On plugin load/startup**
2. **When a new task is added or completed**
3. **When the task file is modified**
4. **Daily heartbeat check** (once per day)

Tasks are materialized (written to file) when they are due:
- **Today**
- **Tomorrow**

Generated tasks are appended to the bottom of tasks.md file.

### Example Workflow

1. **Create recurring task**:
   ```markdown
   - [ ] Weekly report recurring::1week wday::[friday] starting::2025-01-01 due::2025-01-03 eta::2:00 #tlog/work
   ```

2. **See future occurrences** in timeline views (Next 7 Days, This Month)
   - These are virtual, calculated on-the-fly

3. **Actual tasks created** when due tomorrow or today
   - Plugin adds: `- [ ] Weekly report due::2025-01-10 eta::2:00 #tlog/work`
   - Added to bottom of tasks.md

4. **Complete the materialized task**
   - Original recurring task continues generating future occurrences
   - Completed instance is marked done

## Complete Examples

### Daily Task
```markdown
- [ ] Morning exercise recurring::1day starting::2025-01-01 ending::2025-12-31 due::2025-01-01 eta::0:30 #tlog/personal/health
```

### Weekly Task (Multiple Days)
```markdown
- [ ] Gym session recurring::1week wday::[monday,wednesday,friday] starting::2025-01-01 due::2025-01-06 eta::1:30 #tlog/personal/health
```

### Biweekly Task
```markdown
- [ ] Sprint planning recurring::2week wday::[monday] starting::2025-01-01 due::2025-01-06 eta::2:00 #tlog/work/meetings
```

### Monthly Task (Multiple Days)
```markdown
- [ ] Invoice review recurring::1month day::[1,15] starting::2025-01-01 due::2025-01-01 eta::1:00 #tlog/work/admin
```

### Quarterly Task
```markdown
- [ ] Quarterly review recurring::3month day::[1] starting::2025-01-01 due::2025-01-01 eta::3:00 #tlog/work/review
```

### Yearly Task (Multiple Dates)
```markdown
- [ ] Birthday recurring::1year month::[05-15] starting::2025-05-15 due::2025-05-15 eta::2:00 #tlog/personal
```

## Limitations and Notes

1. **One Template Task**: Each recurring pattern needs one template task in tasks.md
2. **No Past Generation**: Plugin doesn't generate past occurrences
3. **Today/Tomorrow Only**: Only materializes tasks due today or tomorrow
4. **No Modification Sync**: Editing a materialized task doesn't update the template
5. **Manual Cleanup**: Completed materialized tasks stay in the file unless manually removed

## Tips and Best Practices

### Use Descriptive Names
```markdown
- [ ] Weekly team sync (every Monday) recurring::1week wday::[monday] ...
```

### Set Realistic ETAs
- Base ETA on typical time needed
- Materialized tasks inherit the ETA from template

### Use Ending Dates for Temporary Recurring Tasks
```markdown
- [ ] Project standup recurring::1day ending::2025-06-30 due::2025-01-01 #tlog/work/project-x
```

### Combine with Projects
```markdown
- [ ] Code review recurring::1day starting::2025-01-01 due::2025-01-01 eta::0:45 #tlog/work/code-review
```

### Weekly Planning
```markdown
- [ ] Weekly planning recurring::1week wday::[sunday] starting::2025-01-01 due::2025-01-05 eta::1:00 #tlog/personal/planning
```

## Troubleshooting

### Tasks Not Appearing

1. **Check format**: Ensure `recurring::` format is correct
2. **Check dates**: Verify starting date is not in future
3. **Check ending**: Make sure task hasn't ended
4. **Reload plugin**: Close and reopen Task Manager

### Duplicate Tasks

- Plugin checks for existing tasks before creating
- If duplicates appear, there may be slight naming differences
- Check task names are identical

### Timeline Views Empty

- Make sure tasks have due dates within the timeline range
- Check that recurring tasks have starting dates
- Verify the custom timeline view days setting

## Performance

- **Efficient Calculation**: Only calculates next 30 occurrences
- **Smart Materialization**: Only writes tasks that are imminent
- **Daily Check**: Once per day maximum for file writes
- **Event-Driven**: Responds to file changes, task completion

## Future Enhancements

Potential improvements:
- Skip holidays
- Custom recurrence rules (e.g., last Friday of month)
- Bi-directional sync (edit materialized task updates template)
- Bulk generation options
- Recurrence history tracking
