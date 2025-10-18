# Fix: Recurring Task Visibility and Due Date Issues

## Issues Fixed

### 1. ✅ Tasks Disappearing When Made Recurring
**Problem**: When you converted a task to recurring, it would disappear from all views.

**Root Cause**: We were blindly hiding ALL recurring templates (`isRecurring && !isGeneratedRecurring`), even if they had no materialized occurrence yet.

**Fix**: Only hide templates if a materialized occurrence exists with the same name and due date.

### 2. ✅ No `due::` Field for Weekly/Yearly Recurring
**Problem**: Weekly and yearly recurring tasks were missing the `due::` field in the markdown file.

**Root Cause**: The `calculateNextOccurrences()` was returning dates, but the template wasn't being updated with a due date.

**Fix**: Always calculate and set the due date when making a task recurring, regardless of type (daily/weekly/monthly/yearly).

### 3. ✅ Starting Date Not Set Automatically
**Problem**: If you didn't manually set a starting date, recurring tasks wouldn't work properly.

**Fix**: Auto-set `starting::` to today's date if not provided.

### 4. ✅ Recurring Icon Not Showing
**Problem**: The 🔄 icon wouldn't appear after making a task recurring.

**Root Cause**: Related to issue #1 - the task was hidden, so you couldn't see the icon.

**Fix**: With templates now visible (when they have no occurrence), the icon shows correctly.

## Technical Details

### Old Template Filtering Logic (BROKEN)

```typescript
// OLD - Hides ALL templates, even without occurrences
if (task.isRecurring && !task.isGeneratedRecurring) return false;
```

**Problem**: This would hide recurring tasks immediately after you created them!

### New Template Filtering Logic (FIXED)

```typescript
// NEW - Only hides templates if an occurrence exists
if (task.isRecurring && !task.isGeneratedRecurring) {
  const hasMaterialized = this.tasks.some(t =>
    !t.isRecurring &&
    t.taskName === task.taskName &&
    t.dueDate === task.dueDate
  );
  if (hasMaterialized) return false; // Hide only if occurrence exists
}
```

**How it works**:
- Template with NO occurrence → **SHOW** (with 🔄 icon)
- Template with occurrence → **HIDE** (show occurrence instead)

### showRecurringEditor() Improvements

```typescript
showRecurringEditor(task: Task) {
  const modal = new RecurringTaskModal(this.app, task, async (updatedTask: Task) => {
    if (updatedTask.isRecurring) {
      // ✅ Set starting date if not provided
      if (!updatedTask.recurringStarting) {
        updatedTask.recurringStarting = this.formatDate(new Date());
      }

      // ✅ Calculate and set due date for ALL recurring types
      const firstOccurrence = this.calculateNextOccurrences(updatedTask, 1)[0];
      if (firstOccurrence) {
        updatedTask.dueDate = firstOccurrence;
      }
    }

    await this.updateTask(updatedTask);

    // Create first occurrence
    if (updatedTask.isRecurring && !updatedTask.isGeneratedRecurring) {
      await this.createFirstOccurrence(updatedTask);
    }

    await this.loadTasks();
    this.renderView();
  });
  modal.open();
}
```

## How It Works Now

### Scenario 1: Create Weekly Recurring Task

**Initial task**:
```markdown
- [ ] Team meeting #tlog
```

**You configure**:
- Type: Weekly
- Days: Monday, Friday
- Starting: (left empty)

**Result in tasks.md**:
```markdown
- [ ] Team meeting due::2025-10-20 recurring::1week wday::[monday,friday] starting::2025-10-17 #tlog
- [ ] Team meeting due::2025-10-20 #tlog
```

**What you see in UI**:
- Template shows with 🔄 1week icon (until occurrence is created)
- Once occurrence exists, template is hidden
- Occurrence shows normally

### Scenario 2: Create Yearly Recurring Task

**Initial task**:
```markdown
- [ ] License renewal due::2025-12-01 #tlog
```

**You configure**:
- Type: Yearly
- Dates: 12-01
- Starting: (left empty)

**Result in tasks.md**:
```markdown
- [ ] License renewal due::2025-12-01 recurring::1year month::[12-01] starting::2025-10-17 #tlog
- [ ] License renewal due::2025-12-01 #tlog
```

**What you see in UI**:
- Template hidden (occurrence exists with same due date)
- Occurrence shows with due date 2025-12-01
- Recurring icon shows on the occurrence

### Scenario 3: Template Without Occurrence Yet

**tasks.md**:
```markdown
- [ ] Future task due::2025-12-01 recurring::1month day::[1] starting::2025-12-01 #tlog
```

**What you see in UI** (before Dec 1):
- Template shows with 🔄 1month icon
- No occurrence yet (starting date is in future)
- Can edit recurring settings by clicking 🔄

**What happens on Dec 1**:
- `createFirstOccurrence()` runs
- Occurrence is created
- Template becomes hidden
- Only occurrence shows

## Benefits

1. **No disappearing tasks**: Tasks stay visible after making them recurring
2. **Always have due dates**: Weekly, monthly, yearly all get proper `due::` field
3. **Smart visibility**: Templates only hidden when they have an active occurrence
4. **Recurring icon visible**: Can see and edit recurring settings
5. **Auto-starting date**: Don't need to manually set starting date

## Testing

### Test 1: Weekly Recurring

1. Create task with no due date
2. Click "+ Recurring"
3. Select "Weekly", check "Monday"
4. Click Save
5. **Expected**:
   - ✅ Task stays visible
   - ✅ Shows 🔄 1week icon
   - ✅ Has `due::` with next Monday's date
   - ✅ Has `starting::` with today's date
   - ✅ Occurrence created
   - ✅ Template hidden once occurrence exists

### Test 2: Yearly Recurring

1. Create task with due date 2025-12-01
2. Click "+ Recurring"
3. Select "Yearly", enter "12-01"
4. Click Save
5. **Expected**:
   - ✅ Task stays visible (as template if same date, or occurrence)
   - ✅ Shows 🔄 1year icon
   - ✅ Has `due::2025-12-01`
   - ✅ Has `month::[12-01]`
   - ✅ Has `starting::` field

### Test 3: Template Visibility

1. Create recurring task starting in future (e.g., next month)
2. **Expected**: Template shows in views (no occurrence yet)
3. When starting date arrives
4. **Expected**: Occurrence created, template hidden

### Test 4: Edit Recurring Settings

1. Click 🔄 icon on recurring task
2. Change settings (e.g., daily → weekly)
3. Click Save
4. **Expected**:
   - ✅ Due date updates to match new pattern
   - ✅ Icon updates to show new pattern
   - ✅ Task stays visible

## Code Locations

**Template filtering**:
- Today view: [main.ts:693-701](main.ts#L693-L701)
- Done view: [main.ts:730-738](main.ts#L730-L738)
- Projects view: [main.ts:770-778](main.ts#L770-L778)
- Timeline views: [main.ts:1471-1497](main.ts#L1471-L1497)

**Recurring editor**: [main.ts:1602-1632](main.ts#L1602-L1632)

## Build Status

✅ **Successfully built**

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

## Summary

**Before**:
- ❌ Tasks disappeared when made recurring
- ❌ Missing `due::` field for weekly/yearly
- ❌ No recurring icon visible
- ❌ Had to manually set starting date

**After**:
- ✅ Tasks stay visible (smart template hiding)
- ✅ All recurring types get proper `due::` field
- ✅ Recurring icon always visible when applicable
- ✅ Starting date auto-set to today

---

**Date**: October 17, 2025
**Status**: ✅ Fixed
**Build**: Success ✅
