# Final Update: Recurring Tasks, New Task Modal, and Mobile Support

## Summary

All requested improvements have been implemented:

1. ✅ **Recurring tasks show only next occurrence** - Templates are hidden from views
2. ✅ **Create New Task command opens modal** - More user-friendly with form inputs
3. ✅ **Mobile support for task creation** - New Task button works on mobile
4. ✅ **Modal works everywhere** - Command works on both desktop and mobile

## Changes Made

### 1. ✅ Hide Recurring Task Templates

**Issue**: Recurring task templates (with `recurring::` field) were showing in all views alongside their generated occurrences, causing clutter.

**Fix**: Added filter to all view rendering methods to hide templates:

```typescript
// Hide recurring templates, show only generated occurrences
if (task.isRecurring && !task.isGeneratedRecurring) return false;
```

**Applied to**:
- Today view ([main.ts:684-690](main.ts#L684-L690))
- Done view ([main.ts:712-718](main.ts#L712-L718))
- Projects view ([main.ts:743-749](main.ts#L743-L749))
- Timeline views ([main.ts:1361-1378](main.ts#L1361-L1378))

**Result**:
- Users only see the actual task occurrences with due dates
- Templates stay in tasks.md but are hidden from UI
- When you complete an occurrence, the template generates the next one

**Example**:
```markdown
# In tasks.md (both exist):
- [ ] Standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
- [ ] Standup due::2025-10-17 #tlog

# In UI (only see):
- [ ] Standup due::2025-10-17 #tlog  ← Only this shows
```

### 2. ✅ Create New Task Command Opens Modal

**Issue**: The command palette "Create New Task" was directly creating a task without user input, making it less useful than the button.

**Fix**: Created `NewTaskModal` class with form inputs:

**Modal Features**:
- **Task Name** (required, focused on open)
- **Due Date** (optional, pre-filled based on current view)
- **ETA** (optional, defaults to 1:00)
- **Project/Section** (optional, pre-filled if in project view)
- **Enter key** submits the form
- **Context-aware** pre-fills based on current view

**Code Changes**:
- Updated command ([main.ts:83-103](main.ts#L83-L103))
- Added `showNewTaskModal()` method ([main.ts:1450-1461](main.ts#L1450-L1461))
- Added `createNewTaskFromModal()` method ([main.ts:1463-1514](main.ts#L1463-L1514))
- Created `NewTaskModal` class ([main.ts:1842-1969](main.ts#L1842-L1969))

**User Experience**:

```
User: Cmd/Ctrl + P → "Create New Task"

┌─────────────────────────────────────┐
│   Create New Task                   │
├─────────────────────────────────────┤
│ Task Name: [Morning standup____]    │
│ Due Date: [2025-10-17]              │
│ ETA: [1:00]                         │
│ Project/Section: [work/meetings]    │
│                                     │
│            [Cancel]  [Create Task]  │
└─────────────────────────────────────┘
```

**Smart Pre-filling**:
- In Today view → Due date = today
- In Timeline view → Due date = today
- In project "work/dev" → Project/Section = "work/dev"
- Command works even if Task Manager isn't open (opens it first)

### 3. ✅ Mobile Task Creation

**Issue**: Mobile view had a New Task button but it was directly creating tasks. The command wasn't working properly on mobile either.

**Fix**: Updated mobile button to use the modal:

```typescript
// Before (mobile):
newTaskCard.addEventListener('click', async () => {
  await this.createNewTask();  // Direct creation
});

// After (mobile):
newTaskCard.addEventListener('click', () => {
  this.showNewTaskModal();  // Opens modal
});
```

**Location**: [main.ts:404-409](main.ts#L404-L409)

**Result**:
- Mobile users get the same modal experience as desktop
- Touch-friendly form inputs
- Command palette works on mobile too
- Consistent UX across all platforms

### 4. ✅ Desktop New Task Button

**Note**: The desktop "+ New Task" button still uses direct creation (`createNewTask()`) for quick task entry. This provides two workflows:

1. **Quick entry** (Desktop button): Click + → Task created with smart defaults → Edit inline
2. **Full form** (Command/Mobile): Cmd+P or mobile button → Modal → Fill all fields → Create

Both work well in their contexts.

## Technical Details

### Files Modified

| File | Lines Modified | Description |
|------|----------------|-------------|
| [main.ts](main.ts) | 84-103 | Updated Create New Task command |
| [main.ts](main.ts) | 404-409 | Updated mobile new task button |
| [main.ts](main.ts) | 684-690 | Filter templates in Today view |
| [main.ts](main.ts) | 712-718 | Filter templates in Done view |
| [main.ts](main.ts) | 743-749 | Filter templates in Projects view |
| [main.ts](main.ts) | 1361-1378 | Filter templates in Timeline views |
| [main.ts](main.ts) | 1450-1514 | New task modal methods |
| [main.ts](main.ts) | 1842-1969 | NewTaskModal class |

### New Classes

**NewTaskModal**:
- Extends Obsidian's Modal class
- Context-aware form with smart defaults
- Validation (task name required)
- Keyboard shortcuts (Enter to submit)
- Clean, consistent with existing modals

### Behavior Summary

| Action | Desktop | Mobile |
|--------|---------|--------|
| **+ New Task button** | Quick create | Opens modal |
| **Cmd/Ctrl + P → Create New Task** | Opens modal | Opens modal |
| **Recurring template visibility** | Hidden | Hidden |
| **Recurring occurrences** | Shown | Shown |

## Build Status

✅ **Build successful**

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production

# No errors!
```

**Plugin size**: 31KB (main.js)

## Testing Guide

### Test 1: Recurring Tasks (Hide Templates)

1. Create a recurring task in tasks.md:
   ```markdown
   - [ ] Daily standup recurring::1day starting::2025-10-17 due::2025-10-17 #tlog
   - [ ] Daily standup due::2025-10-17 #tlog
   ```
2. Open Task Manager
3. **Expected**: Only see the occurrence (second line), not the template
4. Check Today view → Should see occurrence
5. Check Timeline views → Should see occurrence
6. Complete the occurrence → Template generates next one
7. **Expected**: Old occurrence moves to Done, new occurrence appears

### Test 2: Create New Task Command (Desktop)

1. Press `Cmd/Ctrl + P`
2. Type "Create New Task"
3. **Expected**: Modal opens with form
4. Fill in task details:
   - Name: "Test task"
   - Due: 2025-10-18
   - ETA: 2:00
   - Project: work/testing
5. Click "Create Task" (or press Enter)
6. **Expected**: Task appears in Task Manager and tasks.md

### Test 3: Create New Task Command (Context-Aware)

1. Navigate to "Today" view
2. Press `Cmd/Ctrl + P` → "Create New Task"
3. **Expected**: Due date pre-filled with today
4. Cancel and navigate to project "work" → "dev"
5. Press `Cmd/Ctrl + P` → "Create New Task"
6. **Expected**: Project/Section pre-filled with "work/dev"

### Test 4: Mobile Task Creation

1. Resize window to ≤768px (or use mobile device)
2. **Expected**: Card-based mobile UI appears
3. Click "+ New Task" card at top
4. **Expected**: Modal opens (not direct creation)
5. Fill form and create task
6. **Expected**: Task created successfully

### Test 5: Command Without Task Manager Open

1. Close Task Manager tab
2. Press `Cmd/Ctrl + P` → "Create New Task"
3. **Expected**: Task Manager opens AND modal appears
4. Create task
5. **Expected**: Task created and visible

## User Benefits

### For Recurring Tasks
- **Cleaner views**: No more duplicate/confusing entries
- **Less clutter**: Templates hidden but still working
- **Clear understanding**: Only see tasks you need to do
- **Same workflow**: Completion still generates next occurrence

### For Task Creation
- **More control**: Full form instead of editing after creation
- **Faster on mobile**: Touch-friendly modal vs inline editing
- **Better UX**: See all fields at once
- **Validation**: Can't create task without name
- **Smart defaults**: Pre-fills based on context

### For Mobile Users
- **Full parity**: Same features as desktop
- **Touch-optimized**: Large buttons, proper modal
- **Command palette works**: Can use keyboard shortcuts if available
- **Consistent**: Same modal on all platforms

## Migration Notes

**No breaking changes**:
- Existing recurring tasks continue to work
- Templates already in file stay there (just hidden from UI)
- Desktop quick-add button unchanged
- All existing workflows preserved

**What users will notice**:
1. Recurring templates disappear from views (good thing!)
2. Command palette "Create New Task" now opens a form
3. Mobile new task button opens a form (better UX)

## Known Behaviors

1. **Desktop + button**: Still creates task directly (by design for quick entry)
2. **Mobile + button**: Opens modal (better for touch)
3. **Command everywhere**: Opens modal (consistent)
4. **Templates in file**: Stay in tasks.md but hidden in UI (necessary for recurring to work)

---

**Date**: October 17, 2025
**Status**: ✅ Complete
**Build**: Success ✅
**Ready**: For Production ✅
