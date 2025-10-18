# Task Manager Plugin for Obsidian

A comprehensive task management plugin for Obsidian with a Todoist-inspired interface. Manage your tasks with project organization, time tracking, and due dates - all within your markdown files.

## Features

- **Todoist-like Interface**: Clean, intuitive UI with left navigation sidebar
- **Project Organization**: Organize tasks with nested tag structure (`#tlog/project/section`)
- **Time Tracking**: Track estimated time (ETA) for each task with cumulative summaries
- **Due Dates**: Set and track due dates, with automatic overdue detection
- **Today View**: See all tasks due today at a glance
- **Projects View**: Navigate through your projects and sections
- **Markdown-based**: All tasks stored in a single markdown file
- **Configurable**: Customize task file location and identifier tag

## Installation

### From Release (Recommended)
1. Download the latest release from the releases page
2. Extract the files to your vault's `.obsidian/plugins/task-manager/` directory
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Manual Installation
1. Clone this repository or download the source code
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/task-manager/` directory
5. Reload Obsidian
6. Enable the plugin in Settings → Community Plugins

## Usage

### Opening the Task Manager

You can open the Task Manager in two ways:
1. Click the checkmark icon in the left ribbon
2. Use the command palette: `Ctrl/Cmd + P` → "Open Task Manager"

The Task Manager will open as a new tab in the main editor area, just like opening a note.

### Task Format

Tasks must be formatted as markdown checkboxes with specific metadata:

```markdown
- [ ] Task name due::2024-01-15 eta::1:30 #tlog/chores/home
- [ ] Another task due::2024-01-16 eta::0:45 #tlog/work/project
- [x] Completed task due::2024-01-14 eta::2:00 #tlog/personal
```

#### Task Components:

- **Checkbox**: `- [ ]` for incomplete, `- [x]` for complete
- **Task Name**: Any text that doesn't include metadata
- **Due Date**: `due::YYYY-MM-DD` format
- **Estimated Time**: `eta::HH:MM` format (hours:minutes)
- **Project/Section**: Tag structure like `#tlog/project/section`
  - First level after `#tlog` is the **project**
  - Second level is the **section**
  - Example: `#tlog/chores/home` → Project: "chores", Section: "home"

### Views

#### Today View
Shows all tasks due today or overdue:
- Displays cumulative ETA for all today's tasks
- Highlights overdue tasks in red
- Click any task checkbox to mark it complete

#### Projects View
Navigate through your projects and sections:
- Click on a project to see all tasks in that project
- Click on a section to see tasks in that specific section
- Each view shows cumulative ETA for filtered tasks

### Creating Tasks

You can create tasks in two ways:

1. **+ New Task Button**: Click the "+ New Task" button in the navigation (desktop) or the "New Task" card (mobile)
2. **Command Palette**: Use `Ctrl/Cmd + P` → "Create New Task"

**Context-Aware Task Creation**: Tasks are created based on your current view:

| Current View | Task Attributes |
|--------------|-----------------|
| **Today** | Due date set to today |
| **Specific Project** (e.g., work/dev) | Project tag automatically added |
| **Project + Section** | Full project/section tag added |
| **Timeline Views** | Due date set to today |

**Example Workflow**:
1. Navigate to a project like "work" → "development"
2. Click "+ New Task"
3. Task is created with `#tlog/work/development` tag
4. Edit the task name and other details inline

### Editing Tasks

Tasks are fully editable within the Task Manager:

#### Task Name
- Click on the task name to edit it
- Press Enter or click outside to save
- Changes are immediately written to the markdown file

#### Due Date
- Click on the date to edit it (format: YYYY-MM-DD)
- Press Enter or click outside to save
- If a task has no due date, click "+ Due" to add one

#### Estimated Time (ETA)
- Click on the ETA to edit it (format: H:MM or HH:MM)
- Press Enter or click outside to save
- If a task has no ETA, click "+ ETA" to add one (defaults to 1:00)

#### Project/Section
- Click on the project/section tag to edit it
- Format: `project/section` (e.g., `work/development`)
- Press Enter or click outside to save

#### Completing Tasks
- Click the checkbox next to any task to mark it complete
- The task will be marked with `[x]` in the markdown file
- Completed tasks can be viewed in the "Done" section
- Click the checkbox again to uncheck and reopen the task

## Settings

Configure the plugin in Settings → Task Manager:

- **Task File**: Path to your tasks markdown file (default: `tasks.md`)
- **Task Identifier**: Tag prefix for identifying tasks (default: `#tlog`)

## Example tasks.md File

```markdown
# My Tasks

## Work
- [ ] Review pull requests due::2024-01-15 eta::1:00 #tlog/work/code-review
- [ ] Update documentation due::2024-01-15 eta::2:30 #tlog/work/docs
- [ ] Team meeting preparation due::2024-01-16 eta::0:45 #tlog/work/meetings

## Personal
- [ ] Buy groceries due::2024-01-15 eta::1:00 #tlog/chores/shopping
- [ ] Clean garage due::2024-01-20 eta::3:00 #tlog/chores/home
- [ ] Call dentist due::2024-01-15 eta::0:15 #tlog/personal/health

## Completed
- [x] Finish proposal due::2024-01-14 eta::4:00 #tlog/work/project
- [x] Pay bills due::2024-01-13 eta::0:30 #tlog/personal/finance
```

## Tips

1. **Organize by Context**: Use the nested tag structure to organize tasks by context (work/personal) and then by specific projects
2. **Realistic ETAs**: Track your actual time spent to improve ETA estimates
3. **Daily Planning**: Use the "Today" view each morning to plan your day
4. **Project Focus**: Use the Projects view to focus on specific areas of work

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Development mode (watch for changes)
npm run dev

# Production build
npm run build
```

### Project Structure

```
obsidian-task-plugin/
├── main.ts          # Main plugin code
├── styles.css       # UI styling
├── manifest.json    # Plugin manifest
├── package.json     # Dependencies
├── tsconfig.json    # TypeScript config
└── esbuild.config.mjs # Build configuration
```

## Limitations

- Only uses libraries available in the Obsidian API (no external dependencies)
- Tasks must be in a single markdown file
- Completed tasks (with `[x]`) don't appear in the plugin view but remain in the file
- Task parsing happens on file load (not real-time)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - See LICENSE file for details

## Support

If you encounter any issues or have feature requests, please file them in the GitHub issues section.
