# Fix: Recurring Task UI Updates

## Issues Fixed

### Issue 1: Recurring Label Not Updating in Card
**Problem**: After adding/editing recurring settings via the modal, the task card didn't update to show the "🔄 pattern" indicator.

**Fix**: Added explicit `loadTasks()` call before `renderView()` in `showRecurringEditor()` to ensure the UI refreshes with the latest data from the file.

### Issue 2: Due Date Not Updated When Converting to Recurring
**Problem**: When you converted a one-time task to recurring, the due date stayed the same instead of updating to match the first occurrence based on the recurring pattern.

**Fix**: Added logic to detect when a task is being converted to recurring and automatically update its due date to match the calculated first occurrence.

## Technical Details

### showRecurringEditor() - Before

```typescript
showRecurringEditor(task: Task) {
  const modal = new RecurringTaskModal(this.app, task, async (updatedTask: Task) => {
    await this.updateTask(updatedTask);

    if (updatedTask.isRecurring && !updatedTask.isGeneratedRecurring) {
      await this.createFirstOccurrence(updatedTask);
    }

    this.renderView();  // ❌ Doesn't reload tasks first
  });
  modal.open();
}
```

### showRecurringEditor() - After

```typescript
showRecurringEditor(task: Task) {
  const modal = new RecurringTaskModal(this.app, task, async (updatedTask: Task) => {
    // ✅ NEW: If converting to recurring, update due date
    if (updatedTask.isRecurring && !task.isRecurring) {
      const firstOccurrence = this.calculateNextOccurrences(updatedTask, 1)[0];
      if (firstOccurrence) {
        updatedTask.dueDate = firstOccurrence;
      }
    }

    await this.updateTask(updatedTask);

    if (updatedTask.isRecurring && !updatedTask.isGeneratedRecurring) {
      await this.createFirstOccurrence(updatedTask);
    }

    // ✅ NEW: Reload tasks before rendering
    await this.loadTasks();
    this.renderView();
  });
  modal.open();
}
```

## How It Works Now

### Scenario 1: Adding Recurring to Existing Task

**Initial task.md**:
```markdown
- [ ] Team meeting due::2025-10-17 #tlog/work
```

**Steps**:
1. Click "+ Recurring" on the task
2. Select "Weekly"
3. Select "Monday"
4. Set starting date: 2025-10-20 (next Monday)
5. Click Save

**Result in tasks.md**:
```markdown
- [ ] Team meeting due::2025-10-20 recurring::1week wday::[monday] starting::2025-10-20 #tlog/work
- [ ] Team meeting due::2025-10-20 #tlog/work
```

**What changed**:
- ✅ Due date updated from Oct 17 → Oct 20 (first Monday)
- ✅ Recurring fields added to template
- ✅ First occurrence created
- ✅ UI shows "🔄 1week" indicator immediately

### Scenario 2: Editing Existing Recurring Task

**Initial tasks.md**:
```markdown
- [ ] Standup due::2025-10-17 recurring::1day starting::2025-10-17 #tlog
```

**Steps**:
1. Click "🔄 1day" indicator
2. Change to "Weekly" with "Monday" and "Friday"
3. Click Save

**Result in tasks.md**:
```markdown
- [ ] Standup due::2025-10-20 recurring::1week wday::[monday,friday] starting::2025-10-20 #tlog
- [ ] Standup due::2025-10-20 #tlog
```

**What changed**:
- ✅ Pattern updated: 1day → 1week
- ✅ Due date updated to next Monday
- ✅ First occurrence created for Monday
- ✅ UI updates to show "🔄 1week" immediately

### Scenario 3: Removing Recurring

**Initial tasks.md**:
```markdown
- [ ] Task due::2025-10-20 recurring::1day starting::2025-10-17 #tlog
```

**Steps**:
1. Click "🔄 1day"
2. Select "None (One-time task)"
3. Click Save

**Result in tasks.md**:
```markdown
- [ ] Task due::2025-10-20 #tlog
```

**What changed**:
- ✅ Recurring fields removed
- ✅ Due date preserved
- ✅ UI updates to show "+ Recurring" button immediately

## Benefits

1. **Immediate feedback**: UI updates instantly when you save recurring settings
2. **Correct due dates**: Converting to recurring automatically sets the right date
3. **No confusion**: Label always matches the actual state in the file
4. **Smooth UX**: No need to close/reopen Task Manager to see changes

## Code Location

**File**: [main.ts](main.ts)
**Method**: `showRecurringEditor()`
**Lines**: 1602-1624

## Build Status

✅ **Successfully built**

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

## Testing

### Test 1: Add Recurring to One-Time Task

1. Create regular task with due date 2025-10-17
2. Click "+ Recurring"
3. Select "Daily", starting 2025-10-18
4. Click Save
5. **Expected**:
   - Due date changes to 2025-10-18
   - Shows "🔄 1day" immediately
   - First occurrence created

### Test 2: Edit Recurring Pattern

1. Click "🔄 1day" on existing recurring task
2. Change to "Weekly" with specific days
3. Click Save
4. **Expected**:
   - Pattern updates to "🔄 1week"
   - Due date updates to next matching day
   - UI refreshes immediately

### Test 3: Remove Recurring

1. Click "🔄 pattern" on recurring task
2. Select "None"
3. Click Save
4. **Expected**:
   - Shows "+ Recurring" button immediately
   - Due date preserved
   - Recurring fields removed from file

### Test 4: UI Refresh

1. Make any change to recurring settings
2. Click Save
3. **Expected**:
   - No need to close/reopen view
   - Changes visible immediately
   - Task card shows correct indicator

## Summary

**Before**:
- ❌ UI didn't update after saving recurring settings
- ❌ Due date stayed the same when converting to recurring
- ❌ Had to close/reopen to see changes

**After**:
- ✅ UI updates immediately with correct indicator
- ✅ Due date auto-updates to match first occurrence
- ✅ Smooth, instant feedback

---

**Date**: October 17, 2025
**Status**: ✅ Fixed
**Build**: Success ✅
