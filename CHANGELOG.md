# Changelog

All notable changes to the Task Manager plugin will be documented in this file.

## [1.0.0] - 2025-01-15

### Initial Release

#### Core Features
- **Task Manager view** with Todoist-inspired interface
- **Left ribbon icon** for quick access
- **Command palette integration** - "Open Task Manager" and "Create New Task"
- Opens as a tab in the main editor area (not in sidebar)
- Left navigation panel with multiple view options
- Task parsing from markdown files with checkboxes
- Support for nested project structure using tags (#tlog/project/section)

#### Views
- **Today View**: Tasks due today and overdue tasks
- **Upcoming View**: Tasks due in the next 7 days
- **Done View**: Completed tasks history
- **Projects View**: Browse and filter by project/section hierarchy
- **Timeline Views**:
  - 5 preset views: This Week, Next Week, This Month, Next Month, All Tasks
  - Create custom timeline views (next N days)
  - Edit and delete custom timeline views (hover for buttons)

#### Task Management
- **Task Creation**:
  - Context-aware task creation (inherits project, due date from current view)
  - New Task modal with all fields (name, due date, ETA, priority, project, recurring)
  - Desktop: "+ New Task" button in navigation
  - Mobile: "+" floating button in header
- **Task Editing**:
  - Double-click task name to edit (preserves internal links)
  - Click due date to change with date picker
  - Click ETA to edit time estimate
  - Click project/section to modify
  - Click priority badge to change priority
  - Click recurring icon to edit recurring settings
- **Task Deletion**:
  - Desktop: Three-dot menu (⋯) on hover → Delete option
  - Mobile: Long-press task (800ms) → Delete confirmation
  - Confirmation dialog prevents accidental deletions
- **Task Completion**: Click checkbox to toggle done/todo status

#### Priority Labels
- User-created priority labels with custom names
- Customizable colors (hex input or color picker)
- Visual priority badges on task cards
- Priority-based sorting option
- Add, edit, delete, reorder labels in settings
- Default labels: High (red), Medium (yellow), Low (blue)

#### Time Tracking
- **Estimated Time Accumulation (ETA)** for each task
- Format: H:MM or HH:MM (e.g., 1:30, 12:45)
- Cumulative ETA summaries for each view
- Inline editing of ETA values
- "+ ETA" button to add time estimate (defaults to 1:00)

#### Due Dates
- Set and edit due dates inline with date picker
- Date format: YYYY-MM-DD
- Automatic overdue detection (red highlighting)
- "+ Due" button to add due date (defaults to today)
- Context-aware defaults based on current view

#### Recurring Tasks
- **Patterns**: Daily, weekly, monthly
- **Custom schedules**:
  - Specific weekdays (e.g., Monday, Wednesday, Friday)
  - Specific days of month (e.g., 1st, 15th, 30th)
  - Specific months (e.g., January, June, December)
- **Date constraints**:
  - Starting date (when to begin recurring)
  - Ending date (when to stop recurring)
- **Behavior**:
  - Virtual occurrences (materialized on completion)
  - Automatic generation of next occurrence
  - Edit recurring template affects all future occurrences
  - Complete one occurrence, next auto-created
- **Recurring editor modal** with all options

#### Internal Links
- Support for `[[Note Name]]` syntax in task names
- Links rendered as clickable hyperlinks
- Click link to open note in Obsidian
- Links persist after editing (not converted to plain text)
- Double-click task name to edit while preserving links
- Smart file search (exact path or basename matching)

#### Sorting
- Sort options: Due Date, Priority, Project, Name
- Available in all views (Today, Upcoming, Projects, Timeline)
- Dropdown selector in content header
- Persistent sort preference per session

#### Settings
- **Task file path**: Specify which markdown file contains tasks (default: `tasks.md`)
- **Task identifier**: Customize tag prefix (default: `#tlog`)
- **Priority labels**: Manage custom priority labels
  - Add new labels with name and color
  - Edit existing labels (name, color, order)
  - Delete custom labels
  - Reorder labels for priority sorting
  - Color picker with live preview

#### Mobile Support
- Fully responsive design for mobile devices
- Mobile-specific "+" button for task creation
- Long-press gesture (800ms) to delete tasks
- Touch-optimized interactions
- Hidden desktop-only elements (@media queries)
- Three-dot menu hidden on mobile
- All views work on mobile (tested for iOS/Android)

#### User Experience
- Smooth animations and transitions
- Hover effects on all interactive elements
- Visual feedback for actions (notifications)
- Empty state messages when no tasks
- Success/error notifications for operations
- Confirmation dialogs for destructive actions
- Clean, modern UI with Obsidian theme integration

#### Technical Details
- Built with **TypeScript** for type safety
- Uses only **Obsidian API** (no external dependencies)
- No code obfuscation or minification in source
- No telemetry or external network requests
- Local-only data storage (within Obsidian vault)
- Efficient parsing (only on file load, not real-time)
- Clean, readable code with type annotations
- Event delegation where appropriate
- Proper error handling and validation

#### Security & Privacy
- No external network requests
- No analytics or tracking
- No data sent outside Obsidian
- No localStorage for sensitive data
- No eval() or code injection
- Input validation for dates, times, and metadata
- File access limited to user-specified task file

### Known Limitations
- Tasks must be in a single markdown file (configurable path)
- Task parsing happens on file load, not real-time sync
- Virtual recurring tasks cannot be deleted directly (complete them instead)
- No built-in undo for deletions (use Obsidian file recovery)
- No keyboard shortcuts yet (planned for v1.1)
- No drag-and-drop reordering (planned)
- No task dependencies or subtasks (planned)

### Browser/Platform Compatibility
- **Desktop**: Windows, macOS, Linux
- **Mobile**: iOS, Android (via Obsidian Mobile)
- **Minimum Obsidian version**: 1.4.0
- **Tested on**: Obsidian 1.5.x

### Fixed Issues
- Navigation click handlers use addEventListener for better reliability
- Event propagation properly stopped to prevent conflicts
- View opens in main editor area instead of right sidebar
- User selection disabled on navigation items for better UX
- Internal links persist after editing (not converted to plain text)
- Mobile task creation button added (was missing)
- Three-dot menu doesn't accumulate document listeners (event delegation)
- Long-press cancels on touchmove (prevents accidental deletes while scrolling)
