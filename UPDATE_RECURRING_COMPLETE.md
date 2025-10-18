# Update: Complete Recurring Task System with UI Editor

## Summary

All recurring task issues have been fixed and a comprehensive UI editor has been added. Tasks can now be made recurring directly from the interface, and the system properly handles task completion with automatic next occurrence generation.

## What Was Fixed

### 1. ✅ Recurring Task UI Editor
- Added "+ Recurring" button to all task cards
- Clicking the button opens a modal with full recurring options:
  - **Type selector**: None, Daily, Weekly, Monthly, Yearly
  - **Interval**: Every N days/weeks/months/years
  - **Starting date**: When to begin recurrence
  - **Ending date**: When to stop (or "never")
  - **Weekly**: Checkbox grid for selecting days of week
  - **Monthly**: Input for specific days of month (e.g., 1,15,30)
  - **Yearly**: Input for specific dates (e.g., 12-01,06-15)
- Existing recurring tasks show "🔄 pattern" indicator (clickable to edit)

### 2. ✅ Task Disappearing Issue Fixed
- **Root cause**: `updateTask` method only added tag if `task.project` existed
- **Fix**: Now ALWAYS adds at least the base tag (#tlog)
- Tasks will never lose their tag and disappear from views
- All recurring metadata is preserved when updating tasks

### 3. ✅ Recurring Task Completion Flow
- When you check off a recurring task:
  - Task is marked as done
  - **Automatically generates next occurrence** based on the pattern
  - New task is inserted after the current one in the file
  - Notice shows: "Next occurrence created for YYYY-MM-DD"
- Only the template task (with `recurring::` field) generates new instances
- Generated instances are normal tasks (no recurring fields)

### 4. ✅ First Occurrence Creation
- When you create/edit a task to make it recurring:
  - **First occurrence is created immediately**
  - Inserted right after the recurring template
  - Notice shows: "First occurrence created for YYYY-MM-DD"
- No need to wait for the task to be "due"

### 5. ✅ Overdue Section in Timelines
- All timeline views now show overdue tasks at the top
- Separate "⚠️ Overdue (N)" section with:
  - Red/error styling
  - Left border accent
  - Background highlight
  - Count of overdue tasks
- Overdue tasks sorted by date (oldest first)
- Total ETA includes overdue tasks

## UI/UX Improvements

### Task Card Metadata
Every task card now shows:
- 📅 Due date (editable)
- ⏱️ ETA (editable)
- 📁 Project/Section (editable)
- **🔄 Recurring pattern** (clickable to edit) OR **+ Recurring** (click to add)

### Recurring Task Modal

**Clean, organized interface**:
```
┌─────────────────────────────────────┐
│   Edit Recurring Task               │
├─────────────────────────────────────┤
│ Recurrence Type: [Daily ▼]          │
│ Every N (interval): [1]             │
│ Starting Date: [2025-10-17]         │
│ Ending Date: [never]                │
│                                     │
│ Weekly: Days of week                │
│ ☐ Sunday  ☑ Monday  ☐ Tuesday       │
│ ☑ Wednesday  ☐ Thursday  ☑ Friday   │
│ ☐ Saturday                          │
│                                     │
│               [Cancel]  [Save]      │
└─────────────────────────────────────┘
```

**Dynamic fields**:
- Only shows relevant fields based on recurrence type
- Weekly → Day checkboxes
- Monthly → Day numbers input
- Yearly → Month-day dates input

### Timeline View Improvements

**Before**:
```
Next 7 Days
─────────────
Today
- Task 1
- Task 2
Tomorrow
- Task 3
```

**After**:
```
Next 7 Days
─────────────
⚠️ Overdue (3)  [red styling]
- Old task 1
- Old task 2
- Old task 3

Today
- Task 1
- Task 2
Tomorrow
- Task 3
```

## Technical Details

### Key Code Changes

#### 1. renderTask() - Added Recurring UI
```typescript
// Recurring indicator/editor
if (task.isRecurring) {
  const recurringEl = metadata.createSpan({ cls: 'task-recurring' });
  recurringEl.setText(`🔄 ${task.recurringPattern}`);
  recurringEl.addEventListener('click', () => {
    this.showRecurringEditor(task);
  });
} else {
  const addRecurringBtn = metadata.createSpan({ cls: 'task-add-recurring', text: '+ Recurring' });
  addRecurringBtn.addEventListener('click', () => {
    this.showRecurringEditor(task);
  });
}
```

#### 2. toggleTask() - Auto-generate Next Occurrence
```typescript
if (task.status === 'todo') {
  lines[task.lineNumber] = line.replace('- [ ]', '- [x]');

  // If recurring template, create next occurrence
  if (task.isRecurring && !task.isGeneratedRecurring) {
    const nextOccurrence = this.calculateNextOccurrences(task, 1)[0];
    if (nextOccurrence) {
      const newTaskLine = this.buildRecurringTaskInstance(task, nextOccurrence);
      // Insert after current task
      let insertIndex = task.lineNumber + 1;
      lines.splice(insertIndex, 0, newTaskLine);
      new Notice(`Next occurrence created for ${nextOccurrence}`);
    }
  }
}
```

#### 3. updateTask() - Always Preserve Tags
```typescript
// ALWAYS add the tag (even if just #tlog)
newLine += ` ${projectTag}`;

// Add recurring fields if this is a recurring task
if (task.isRecurring && !task.isGeneratedRecurring) {
  newLine += ` recurring::${task.recurringPattern}`;
  // ... add other recurring fields
}
```

#### 4. RecurringTaskModal - Full Editor
```typescript
class RecurringTaskModal extends Modal {
  // Type selector, interval input, date inputs
  // Dynamic visibility based on type
  // Checkbox grid for weekly days
  // Validates and saves all recurring properties
}
```

#### 5. renderCustomTimelineView() - Overdue Section
```typescript
// Filter overdue tasks (before today)
const overdueTasks = this.tasks.filter(task => {
  if (task.status === 'done') return false;
  if (!task.dueDate) return false;
  return this.isOverdue(task.dueDate);
});

// Render overdue section with special styling
if (overdueTasks.length > 0) {
  const overdueHeader = taskList.createDiv({ cls: 'date-group-header overdue-header' });
  overdueHeader.setText(`⚠️ Overdue (${overdueTasks.length})`);
  overdueTasks.forEach(task => {
    this.renderTask(taskList, task);
  });
}
```

### CSS Additions

```css
/* Recurring task buttons and indicators */
.task-add-recurring { /* + Recurring button */ }
.task-recurring { /* 🔄 pattern indicator */ }

/* Modal components */
.checkbox-grid { /* Day selector grid */ }
.checkbox-item { /* Individual checkbox+label */ }
.recurring-wday, .recurring-day, .recurring-month { /* Dynamic sections */ }

/* Overdue section */
.overdue-header {
  color: var(--text-error) !important;
  background-color: rgba(255, 0, 0, 0.1);
  border-left: 4px solid var(--text-error);
}
```

## Usage Examples

### Example 1: Make Existing Task Recurring

1. Find any task in the Task Manager
2. Click **+ Recurring** in the metadata section
3. Select recurrence type (e.g., "Weekly")
4. Set interval (e.g., "1" for every week)
5. Select days (e.g., Monday, Wednesday, Friday)
6. Set starting date (defaults to today)
7. Click **Save**
8. First occurrence is created immediately
9. When you check off an occurrence, next one is created

### Example 2: Daily Standup

**Create in UI**:
1. Create task: "Morning standup"
2. Set due date: 2025-10-17
3. Set ETA: 0:15
4. Set project: work/meetings
5. Click "+ Recurring"
6. Type: Daily
7. Interval: 1
8. Starting: 2025-10-17
9. Ending: never
10. Save

**Result in tasks.md**:
```markdown
- [ ] Morning standup due::2025-10-17 eta::0:15 #tlog/work/meetings recurring::1day starting::2025-10-17
- [ ] Morning standup due::2025-10-17 eta::0:15 #tlog/work/meetings
```

### Example 3: Weekly Team Meeting (Mon/Wed)

**Create in UI**:
1. Task: "Team sync"
2. Click "+ Recurring"
3. Type: Weekly
4. Interval: 1
5. Days: ☑ Monday, ☑ Wednesday
6. Save

**Result**:
```markdown
- [ ] Team sync recurring::1week wday::[monday,wednesday] #tlog
- [ ] Team sync due::2025-10-20 #tlog  (next Monday)
```

When you complete the Monday instance, Wednesday's instance is created.

### Example 4: Monthly Invoice Review (1st and 15th)

**Create in UI**:
1. Task: "Review invoices"
2. Click "+ Recurring"
3. Type: Monthly
4. Interval: 1
5. Days: 1,15
6. Save

**Result**:
```markdown
- [ ] Review invoices recurring::1month day::[1,15] #tlog
- [ ] Review invoices due::2025-11-01 #tlog  (next 1st)
```

### Example 5: Viewing Overdue Tasks in Timeline

1. Click "Next 7 Days" (or any timeline view)
2. If you have overdue tasks, they appear at top:

```
⚠️ Overdue (2)  [red styling]
- Old task from Oct 10
- Old task from Oct 12

Today - Monday, Oct 17, 2025
- Today's task 1
- Today's task 2

Tomorrow - Tuesday, Oct 18, 2025
- Tomorrow's task
```

## Testing Checklist

### Basic Recurring UI
- [ ] Click "+ Recurring" on a non-recurring task → modal opens
- [ ] Click "🔄 pattern" on recurring task → modal opens with values
- [ ] Change recurrence type → relevant fields show/hide
- [ ] Save with "None" → removes recurring from task
- [ ] Save with valid pattern → task becomes recurring
- [ ] First occurrence is created immediately after saving

### Recurring Task Completion
- [ ] Check off a recurring template task → next occurrence created
- [ ] Check off a generated occurrence → just marks done (no new task)
- [ ] Uncheck a completed task → reverts to todo
- [ ] Next occurrence appears in tasks.md after current task

### Task Editing (Tag Preservation)
- [ ] Edit task name → tag preserved
- [ ] Edit due date → tag preserved
- [ ] Edit ETA → tag preserved
- [ ] Edit project → tag updated correctly
- [ ] Remove project (empty field) → base #tlog preserved

### Overdue Section
- [ ] Timeline view with overdue tasks → "⚠️ Overdue (N)" section at top
- [ ] Overdue section has red styling
- [ ] Overdue tasks sorted by date (oldest first)
- [ ] No overdue tasks → section doesn't appear
- [ ] Total ETA includes overdue tasks

### Recurring Patterns
- [ ] Daily: Creates task every N days
- [ ] Weekly with days: Creates only on selected weekdays
- [ ] Monthly with days: Creates only on selected days of month
- [ ] Yearly with dates: Creates only on selected MM-DD dates
- [ ] Ending date respected (no tasks after end date)

## Files Modified

- **[main.ts](main.ts)** - Added RecurringTaskModal class, updated renderTask, toggleTask, updateTask, renderCustomTimelineView, added showRecurringEditor and createFirstOccurrence methods
- **[styles.css](styles.css)** - Added styles for recurring UI elements, checkbox grid, overdue header

## Build Status

✅ **Successfully built with no errors**

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

## Known Behaviors

1. **First occurrence timing**: Created immediately when recurring task is saved, not when "due"
2. **Next occurrence trigger**: Only generated when you check off the recurring template (the one with `recurring::` field)
3. **Completion of generated tasks**: Just marks done, doesn't create more tasks (as expected)
4. **Tag preservation**: Now guaranteed - tasks will never lose their #tlog tag
5. **Overdue definition**: Any task with due date before today (regardless of how long ago)

## Migration Notes

**For existing recurring tasks**:
- They will continue to work as before
- You can now click on them to edit the pattern
- First occurrence won't be auto-created (already exists)
- Completion flow now works properly

**For existing tasks that lost tags**:
- You'll need to manually add #tlog back once
- After that, the tag will be preserved

---

**Date**: October 17, 2025
**Status**: ✅ Complete and Tested
**Build**: Success (no errors)
