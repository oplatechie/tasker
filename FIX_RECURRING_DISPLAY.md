# Fix: Show Only Next Recurring Occurrence

## Issue

Recurring tasks were displaying ALL future occurrences (30 of them) instead of just the next one.

**Example of problem**:
```
Today view showed:
- Daily standup (today)
- Daily standup (tomorrow)
- Daily standup (day after)
- Daily standup (day after that)
... 30 occurrences total
```

## Root Cause

In `generateFutureRecurringTasks()` method (line 1226), the code was generating 30 virtual occurrences:

```typescript
// OLD CODE
const nextOccurrences = this.calculateNextOccurrences(recurringTask, 30); // Next 30 occurrences
```

## Fix Applied

Changed to generate only 1 occurrence AND check if it's already materialized:

```typescript
// NEW CODE
const nextOccurrences = this.calculateNextOccurrences(recurringTask, 1); // Only next 1 occurrence

if (nextOccurrences.length > 0) {
  const occurrenceDate = nextOccurrences[0];

  // Check if this occurrence is already materialized in tasks.md
  const alreadyExists = this.tasks.some(t =>
    t.taskName === recurringTask.taskName &&
    t.dueDate === occurrenceDate &&
    !t.isRecurring
  );

  // Only create virtual task if it doesn't already exist
  if (!alreadyExists) {
    const virtualTask: Task = {
      ...recurringTask,
      dueDate: occurrenceDate,
      isGeneratedRecurring: true,
      lineNumber: -1,
      rawLine: ''
    };

    generatedTasks.push(virtualTask);
  }
}
```

## How It Works Now

### Scenario 1: Recurring Task with No Materialized Occurrence

**tasks.md**:
```markdown
- [ ] Daily standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
```

**What you see in UI**:
```
- Daily standup (2025-10-17) ← Virtual task (next occurrence)
```

The template is hidden, and a virtual task for the next occurrence is shown.

### Scenario 2: Recurring Task with Materialized Occurrence

**tasks.md**:
```markdown
- [ ] Daily standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
- [ ] Daily standup due::2025-10-17 #tlog
```

**What you see in UI**:
```
- Daily standup (2025-10-17) ← Real task from file
```

No virtual task is created because the occurrence already exists in the file.

### Scenario 3: After Completing an Occurrence

**Initial state**:
```markdown
- [ ] Daily standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
- [ ] Daily standup due::2025-10-17 #tlog
```

**You check off the occurrence** → `toggleTask()` runs:
1. Marks current task as done: `- [x] Daily standup due::2025-10-17 #tlog`
2. Generates next occurrence: `- [ ] Daily standup due::2025-10-18 #tlog`

**New state in tasks.md**:
```markdown
- [ ] Daily standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
- [x] Daily standup due::2025-10-17 #tlog
- [ ] Daily standup due::2025-10-18 #tlog
```

**What you see in UI**:
```
Today (Oct 17):
- (nothing - completed task moved to Done view)

Tomorrow (Oct 18):
- Daily standup (2025-10-18) ← New occurrence
```

## Benefits

1. **Cleaner views**: Only see the next task you need to do
2. **No clutter**: Not overwhelmed by 30 future occurrences
3. **Smart display**: Shows virtual task only if not already materialized
4. **Automatic progression**: As you complete tasks, next ones appear
5. **Performance**: Generates only 1 virtual task per recurring template instead of 30

## Code Location

**File**: [main.ts](main.ts)
**Method**: `generateFutureRecurringTasks()`
**Lines**: 1220-1254

## Build Status

✅ **Successfully built with no errors**

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

## Testing

### Test 1: Single Virtual Occurrence

1. Create a recurring task in tasks.md:
   ```markdown
   - [ ] Test recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
   ```
2. Open Task Manager
3. **Expected**: See exactly 1 occurrence of "Test" (virtual, for today)
4. Check Timeline views (Next 7 Days, etc.)
5. **Expected**: See exactly 1 occurrence (not 7, not 30)

### Test 2: No Duplicate When Materialized

1. Add both template and occurrence:
   ```markdown
   - [ ] Test recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
   - [ ] Test due::2025-10-17 #tlog
   ```
2. Open Task Manager
3. **Expected**: See exactly 1 task (the real one, not virtual)
4. No duplicates

### Test 3: Progression After Completion

1. Start with template only (virtual occurrence shows)
2. Check off the virtual task
3. **Expected**:
   - Task is materialized and marked done
   - Next occurrence is created
   - New virtual task for day after tomorrow appears
4. You should always see exactly 1 upcoming occurrence

### Test 4: Weekly Recurring

1. Create weekly task:
   ```markdown
   - [ ] Team meeting recurring::1week wday::[monday] starting::2025-10-20 due::2025-10-20 #tlog
   ```
2. Open Task Manager on Oct 17 (Thursday)
3. **Expected**: See 1 occurrence for Monday, Oct 20
4. Check timeline views
5. **Expected**: See only 1 occurrence (not multiple Mondays)

## Summary

**Before**: 30 occurrences cluttering every view
**After**: 1 occurrence - the next one you need to do

The plugin now shows a clean, focused view of your recurring tasks!

---

**Date**: October 17, 2025
**Status**: ✅ Fixed
**Build**: Success ✅
