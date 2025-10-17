# Debugging Guide

## Current Changes

I've added extensive debugging to help identify the project selection issue:

### Debug Logging Added

1. **Task Loading** - Logs when tasks are loaded:
   - Total number of tasks
   - Full task objects

2. **Navigation Rendering** - Logs project navigation:
   - List of all projects being rendered
   - Each project item creation
   - Click events on projects and sections

3. **Event Handlers** - Logs all click events:
   - "Today clicked"
   - "Project clicked: [project name]"
   - "Section clicked: [section name]"
   - "About to re-render with project: [project name]"

## How to Debug

### Step 1: Copy Updated Files

```bash
cp /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/main.js \
   /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/manifest.json \
   /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/styles.css \
   /path/to/YourVault/.obsidian/plugins/task-manager/
```

### Step 2: Open Developer Console

In Obsidian:
1. Press `Cmd/Ctrl + Shift + I` (or `Cmd + Option + I` on Mac)
2. Click on the "Console" tab

### Step 3: Open Task Manager

Click the checkmark icon in the left ribbon or use the command palette.

### Step 4: Check Console Output

You should see:
```
Loaded tasks: [array of task objects]
Total tasks: X
Rendering projects: ['project1', 'project2', ...]
Created project item for: project1
Created project item for: project2
...
```

### Step 5: Try Moving Your Mouse Over a Project

When you hover over a project, you should see:
```
Project mouseover: project1
```

If you see this, the element is receiving mouse events.

### Step 6: Try Clicking a Project

When you click a project, you should see ONE OR MORE of:
```
Project mousedown: project1
Project mouseup: project1
Project onclick (direct): project1
Project clicked: project1 click
About to re-render with project: project1
```

If you see NONE of these, something is blocking clicks.

## What to Check

### If you see NO console logs:
- The plugin isn't loading correctly
- Check if the plugin is enabled in Settings → Community Plugins
- Check if the files were copied to the correct location

### If you see task logs but NO project logs:
- Tasks might not have the correct format
- Check your tasks.md file format:
  ```markdown
  - [ ] Task name due::2025-10-17 eta::1:00 #tlog/project/section
  ```
- The `#tlog` identifier must match your settings

### If you see project logs but NO click logs:
- CSS or z-index issue preventing clicks
- Try clicking directly on the text
- Try using keyboard (Tab to focus, Enter to activate)

### If you see click logs but nothing happens:
- The render is failing
- Check for JavaScript errors in console
- The task file might be missing

## Testing Keyboard Navigation

I've added keyboard support:
1. Press Tab to navigate to project items
2. Press Enter to select
3. Check console for "Project clicked: [name] keydown"

## Common Issues

### Issue: "Task file not found"
- Check Settings → Task Manager
- Ensure the path is correct (relative to vault root)
- Default is `tasks.md`

### Issue: No projects showing
- Check that tasks have the format: `#tlog/project/section`
- Tasks must have at least one level after `#tlog`
- Example: `#tlog/work` creates project "work"

### Issue: Click seems to work but view doesn't change
- Check console for "About to re-render" message
- If you see it, the event is firing but render might be failing
- Look for any red error messages in console

## Removing Debug Logs

Once we fix the issue, we can remove all the `console.log` statements for production.

## Additional Debugging

### Check Element in DOM

After opening the plugin, in the Console tab, run:
```javascript
document.querySelectorAll('.nav-item.project-item')
```

This should return a list of project elements. If it returns empty, the elements aren't being created.

### Check for Overlays

In the Console, run:
```javascript
document.querySelectorAll('.task-manager-nav')[0].style.zIndex
```

Should return "1" or a positive number.

### Force Click Programmatically

Try clicking via code:
```javascript
document.querySelector('.nav-item.project-item').click()
```

If this works and you see logs, then something is intercepting your actual mouse clicks.

## Next Steps

After following these steps, please share:
1. What you see in the console when you open the plugin
2. What you see when you HOVER over a project (mouseover log?)
3. What you see when you CLICK a project (any of the event logs?)
4. Any error messages (in red) in the console
5. Result of running the DOM query commands above
