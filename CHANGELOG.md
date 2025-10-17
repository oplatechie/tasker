# Changelog

All notable changes to the Task Manager plugin will be documented in this file.

## [1.0.0] - 2025-10-17

### Initial Release

#### Features
- Task Manager view with Todoist-inspired interface
- Left ribbon icon for quick access
- Command palette integration
- Opens as a tab in the main editor area (not in sidebar)
- Left navigation panel with Today and Projects views
- Task parsing from markdown files with checkboxes
- Support for nested project structure using tags (#tlog/project/section)
- Task metadata support:
  - Due dates (due::YYYY-MM-DD)
  - Estimated time (eta::HH:MM)
  - Project and section organization
  - Status tracking (todo/done)
- Cumulative ETA display for Today and Projects views
- Overdue task highlighting
- Click-to-complete task functionality
- Configurable settings:
  - Custom task file path
  - Custom task identifier tag
- Completed tasks hidden from view but preserved in file
- Responsive design with mobile support
- Dark mode support

#### Technical Details
- Built with TypeScript and Obsidian API
- No external dependencies
- Clean separation of concerns (parser, view, settings)
- Event-based interaction handling
- Efficient task filtering and organization

### Fixed
- Navigation click handlers now use addEventListener for better reliability
- Event propagation properly stopped to prevent conflicts
- View opens in main editor area instead of right sidebar
- User selection disabled on navigation items for better UX
