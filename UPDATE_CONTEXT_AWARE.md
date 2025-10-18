# Update: Context-Aware Task Creation

## Summary

The **+ New Task** button and **Create New Task** command now create tasks based on the current view context, making task creation much more intuitive and efficient.

## What Changed

### Before
- All new tasks were created with today's due date and the base `#tlog` tag
- Users had to manually edit project tags after creation

### After
- Tasks are created with context from the current view:
  - **Today view**: Creates task with today's due date
  - **Specific project selected**: Creates task with that project tag
  - **Section selected**: Creates task with full project/section tag
  - **Timeline views**: Creates task with today's due date
  - **Done view**: Creates task with today's due date

## Examples

### Example 1: Creating Task in a Project

**Steps:**
1. Navigate to Projects → work → development
2. Click "+ New Task"

**Result:**
```markdown
- [ ] New Task eta::1:00 #tlog/work/development
```

### Example 2: Creating Task in Today View

**Steps:**
1. Click "Today" in navigation
2. Click "+ New Task"

**Result:**
```markdown
- [ ] New Task due::2025-10-17 eta::1:00 #tlog
```

### Example 3: Creating Task in Timeline View

**Steps:**
1. Click "Next 7 Days" timeline view
2. Click "+ New Task"

**Result:**
```markdown
- [ ] New Task due::2025-10-17 eta::1:00 #tlog
```

## Technical Details

### Updated Method: `createNewTask()`

The method now checks:
- `this.currentView` - Which view is active (today, projects, done, custom-timeline)
- `this.selectedProject` - Which project is selected (if any)
- `this.selectedSection` - Which section is selected (if any)

And builds the task accordingly:
```typescript
// Set due date based on current view
if (this.currentView === 'today') {
  dueDate = `due::${today}`;
}

// Set project tag based on selected project/section
if (this.selectedProject) {
  projectTag += '/' + this.selectedProject;
  if (this.selectedSection) {
    projectTag += '/' + this.selectedSection;
  }
}
```

### User Notification

The notice now shows context:
- `"New task created in work/development!"` (when project selected)
- `"New task created today!"` (in today view)
- `"New task created custom-timeline!"` (in timeline view)

## Benefits

1. **Faster workflow**: No need to manually set project tags
2. **Less errors**: Reduces typos in project names
3. **Intuitive**: Behaves as users expect
4. **Maintains flexibility**: All fields still editable after creation

## Files Modified

- **[main.ts:1026-1082](main.ts#L1026-L1082)** - Updated `createNewTask()` method
- **[README.md](README.md)** - Added "Creating Tasks" section with context-aware behavior
- **[QUICKSTART.md](QUICKSTART.md)** - Added context-aware task creation table

## Build Status

✅ Successfully built with no errors

```bash
npm run build
> obsidian-task-plugin@1.0.0 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

## Testing Checklist

Test the following scenarios:

- [ ] Create task in Today view → should have today's due date
- [ ] Navigate to project "work" → create task → should have `#tlog/work` tag
- [ ] Navigate to section "work/dev" → create task → should have `#tlog/work/dev` tag
- [ ] Create task in "Next 7 Days" view → should have today's due date
- [ ] Create task in Done view → should have today's due date
- [ ] Verify all created tasks appear at top of tasks.md
- [ ] Verify notice message shows correct context

---

**Date**: October 17, 2025
**Status**: ✅ Complete and Ready for Testing
