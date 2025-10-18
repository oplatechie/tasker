# Task Manager Plugin - Quick Start Guide

## Installation (Copy-Paste Ready)

```bash
# 1. Create plugin directory in your Obsidian vault
mkdir -p "/path/to/your/vault/.obsidian/plugins/task-manager"

# 2. Copy the three required files
cp /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/main.js \
   /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/styles.css \
   /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin/manifest.json \
   "/path/to/your/vault/.obsidian/plugins/task-manager/"

# 3. Reload Obsidian (Cmd/Ctrl + R)
```

## Rebuild After Changes

```bash
cd /Users/chinmayk/Documents/dev/obplugin/obsidian-task-plugin
npm run build
# Then copy files again (see step 2 above)
```

## Creating Tasks (Context-Aware)

The **+ New Task** button creates tasks based on your current view:

| Current View | Task Created With | Example |
|--------------|-------------------|---------|
| **Today** | Due date = today | `- [ ] New Task due::2025-10-17 eta::1:00 #tlog` |
| **Specific Project** (e.g., work/dev) | Project tag set | `- [ ] New Task eta::1:00 #tlog/work/dev` |
| **Project + Section** (e.g., work/dev/backend) | Full path tag | `- [ ] New Task eta::1:00 #tlog/work/dev/backend` |
| **Timeline Views** | Due date = today | `- [ ] New Task due::2025-10-17 eta::1:00 #tlog` |
| **Done** | Due date = today | `- [ ] New Task due::2025-10-17 eta::1:00 #tlog` |

**Tips:**
- Navigate to a specific project/section first, then click + to create a task in that context
- All task fields (name, due date, ETA, project) are editable by clicking on them
- Press Enter to save edits

## Task Format Examples

### Basic Task
```markdown
- [ ] Review code due::2025-10-17 eta::1:30 #tlog/work/review
```

### Recurring Tasks

**Daily (every day at 9am standup)**
```markdown
- [ ] Morning standup recurring::1day starting::2025-10-17 due::2025-10-17 eta::0:15 #tlog/work/meetings
```

**Weekly (Mondays and Wednesdays)**
```markdown
- [ ] Team sync recurring::1week wday::[monday,wednesday] starting::2025-10-17 due::2025-10-21 eta::1:00 #tlog/work/meetings
```

**Bi-weekly (every 2 weeks on Monday)**
```markdown
- [ ] Sprint planning recurring::2week wday::[monday] starting::2025-10-17 due::2025-10-21 eta::2:00 #tlog/work/planning
```

**Monthly (1st and 15th)**
```markdown
- [ ] Review invoices recurring::1month day::[1,15] starting::2025-10-17 due::2025-11-01 eta::1:00 #tlog/work/admin
```

**Quarterly (first day of quarter)**
```markdown
- [ ] Quarterly review recurring::3month day::[1] starting::2025-10-01 due::2025-10-01 eta::3:00 #tlog/work/review
```

**Yearly (birthday, anniversary)**
```markdown
- [ ] Mom's birthday recurring::1year month::[05-15] starting::2025-05-15 due::2025-05-15 eta::2:00 #tlog/personal
```

**With end date (project ends June 30)**
```markdown
- [ ] Daily standup recurring::1day ending::2025-06-30 due::2025-10-17 eta::0:15 #tlog/work/project-x
```

## Field Reference

| Field | Format | Example | Required |
|-------|--------|---------|----------|
| Task | `- [ ] text` | `- [ ] Write docs` | ✅ Yes |
| Due | `due::YYYY-MM-DD` | `due::2025-10-17` | ❌ No |
| ETA | `eta::H:MM` | `eta::1:30` | ❌ No |
| Project | `#tlog/proj/sec` | `#tlog/work/dev` | ✅ Yes* |
| Recurring | `recurring::Nunit` | `recurring::1day` | ❌ No |
| Starting | `starting::YYYY-MM-DD` | `starting::2025-10-17` | ❌ No |
| Ending | `ending::YYYY-MM-DD` | `ending::2025-12-31` | ❌ No |
| Week Days | `wday::[days]` | `wday::[monday,friday]` | ❌ No** |
| Month Days | `day::[numbers]` | `day::[1,15,30]` | ❌ No*** |
| Year Dates | `month::[MM-DD]` | `month::[12-01,06-15]` | ❌ No**** |

\* At least one tag matching the identifier (default `#tlog`)
\*\* Only for weekly recurring tasks
\*\*\* Only for monthly recurring tasks
\*\*\*\* Only for yearly recurring tasks

## Views

| View | Keyboard | Description |
|------|----------|-------------|
| Today | - | Tasks due today |
| Projects | - | Browse by project/section |
| Done | - | Completed tasks |
| Next 7 Days | - | Tasks due in next week |
| Next Week | - | Tasks due in next 7 days |
| This Month | - | Tasks due in next 30 days |
| Custom | + button | Create your own timeline |

## Keyboard Shortcuts

| Action | Method |
|--------|--------|
| Open Task Manager | `Cmd/Ctrl + P` → "Open Task Manager" |
| Create New Task | `Cmd/Ctrl + P` → "Create New Task" |
| Reload Plugin | `Cmd/Ctrl + R` (reload Obsidian) |

## Editing Tasks

**Everything is editable by clicking:**

- **Task Name**: Click text to edit
- **Due Date**: Click date to edit (format: YYYY-MM-DD)
- **ETA**: Click time to edit (format: H:MM)
- **Project**: Click project/section to edit (format: project/section)

**Add missing fields:**

- Click **+ Due** to add due date
- Click **+ ETA** to add estimated time

**All changes save to tasks.md automatically!**

## How Recurring Tasks Work

### Virtual Tasks (Timeline Views)
- Plugin calculates future occurrences on-the-fly
- Shows in timeline views (Next 7 Days, etc.)
- **Not written to file** until due

### Materialized Tasks (Written to File)
Plugin automatically writes recurring tasks to tasks.md when:
- Due **today** or **tomorrow**
- On plugin load
- When you add/complete a task
- When tasks.md is modified
- Once per day (heartbeat check)

**Example:**
```markdown
# Original recurring task (stays in file)
- [ ] Standup recurring::1day starting::2025-10-17 due::2025-10-17 eta::0:15 #tlog/work

# Generated instances (added automatically when due)
- [ ] Standup due::2025-10-18 eta::0:15 #tlog/work
- [ ] Standup due::2025-10-19 eta::0:15 #tlog/work
```

## Troubleshooting

### Tasks not showing
- Check task has checkbox: `- [ ]`
- Check task has identifier tag: `#tlog`
- Check due date format: `due::YYYY-MM-DD`
- Reload plugin: `Cmd/Ctrl + R`

### Recurring tasks not generating
- Check format: `recurring::1day` (no spaces)
- Check starting date not in future
- Check ending date not in past
- Look in timeline views (Next 7 Days)

### Edits not saving
- Check tasks.md file exists
- Check file path in settings
- Check write permissions
- Look for error notices

### ETA not calculating
- Check format: `eta::1:30` (with colon)
- Check task not completed: `[x]`
- Check task in current view

## Documentation

📖 **Full guides available:**
- [README.md](README.md) - Complete feature overview
- [RECURRING_TASKS.md](RECURRING_TASKS.md) - Detailed recurring tasks guide
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Technical implementation details

## Support

Found a bug or want a feature? Check the documentation or create an issue.

---

**Status**: ✅ Ready to Use | **Build**: Success | **Size**: 33KB
