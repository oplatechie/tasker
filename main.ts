import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	ItemView,
	WorkspaceLeaf,
	TFile,
	Notice,
	Modal,
	EventRef
} from 'obsidian';

// Priority Label Interface
interface PriorityLabel {
	id: string;
	name: string;
	color: string; // Hex color value
	order: number; // For sorting priority (lower number = higher priority)
}

// Sorting options
type SortOption = 'dueDate' | 'duration' | 'alphabetical' | 'project' | 'priority';

// New Task Data Interface (for modals)
interface NewTaskData {
	name: string;
	dueDate: string | null;
	eta: string | null;
	project: string | null;
	section: string | null;
	priority: string | null;
	isRecurring: boolean;
	recurringPattern: string | null;
	recurringStarting: string | null;
	recurringEnding: string | null;
	recurringWDay: number[] | null;
	recurringDay: number[] | null;
	recurringMonth: string[] | null;
}

// Plugin Settings Interface
interface TaskManagerSettings {
	taskFile: string;
	taskIdentifier: string;
	sortBy: SortOption;
	priorityLabels: PriorityLabel[];
}

const DEFAULT_SETTINGS: TaskManagerSettings = {
	taskFile: 'tasks.md',
	taskIdentifier: '#tlog',
	sortBy: 'dueDate',
	priorityLabels: [
		{ id: 'high', name: 'High', color: '#ff4444', order: 1 },
		{ id: 'medium', name: 'Medium', color: '#ffaa00', order: 2 },
		{ id: 'low', name: 'Low', color: '#4444ff', order: 3 }
	]
}

// Task Interface
interface Task {
	lineNumber: number;
	taskName: string;
	dueDate: string | null;
	eta: string | null; // Format: hh:mm
	project: string | null;
	section: string | null;
	tags: string[];
	status: 'todo' | 'done';
	rawLine: string;
	isRecurring: boolean;
	recurringPattern: string | null; // e.g., "1day", "2week"
	recurringStarting: string | null; // YYYY-MM-DD
	recurringEnding: string | null; // YYYY-MM-DD or "never"
	recurringWDay: number[] | null; // For weekly: [1,2] for Monday, Tuesday
	recurringDay: number[] | null; // For monthly: [1,15,30]
	recurringMonth: string[] | null; // For yearly: ["12-01", "02-27"]
	isGeneratedRecurring?: boolean; // True if this is a calculated future task
	priority: string | null; // Priority label ID
}

// Custom Timeline View Interface
interface CustomTimelineView {
	id: string;
	name: string;
	type: 'date-range' | 'this-week' | 'next-week' | 'this-month' | 'next-month' | 'all-tasks';
	days?: number; // Number of days from today (for date-range type)
	isPreset?: boolean; // If true, cannot be deleted
}

// View Type Constant
const VIEW_TYPE_TASK_MANAGER = 'task-manager-view';

// Main Plugin Class
export default class TaskManagerPlugin extends Plugin {
	settings: TaskManagerSettings;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_TASK_MANAGER,
			(leaf) => new TaskManagerView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('checkmark', 'Task Manager', () => {
			this.activateView().catch(console.error);
		});

		// Add command to open task manager
		this.addCommand({
			id: 'open-task-manager',
			name: 'Open Task Manager',
			callback: () => {
				this.activateView().catch(console.error);
			}
		});

		// Add command to create new task (opens modal)
		this.addCommand({
			id: 'create-new-task',
			name: 'Create New Task',
			callback: () => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER);
				if (leaves.length > 0) {
					const view = leaves[0].view as TaskManagerView;
					view.showNewTaskModal();
				} else {
					// Create task manager if not open, then show modal
					this.activateView().then(() => {
						const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER);
						if (leaves.length > 0) {
							const view = leaves[0].view as TaskManagerView;
							view.showNewTaskModal();
						}
					}).catch(console.error);
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new TaskManagerSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER);

		if (leaves.length > 0) {
			// View already exists, reveal it
			leaf = leaves[0];
		} else {
			// Create new leaf in main editor area
			leaf = workspace.getLeaf('tab');
			await leaf?.setViewState({
				type: VIEW_TYPE_TASK_MANAGER,
				active: true,
			});
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		// Cleanup - leaves are automatically detached by Obsidian
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Task Manager View
class TaskManagerView extends ItemView {
	plugin: TaskManagerPlugin;
	tasks: Task[] = [];
	currentView: 'today' | 'projects' | 'done' | 'custom-timeline' = 'today';
	selectedProject: string | null = null;
	selectedSection: string | null = null;
	fileWatcherRef: EventRef | null = null;
	collapsedProjects: Set<string> = new Set();
	isMobile: boolean = false;
	customTimelineViews: CustomTimelineView[] = [
		{ id: 'this-week', name: 'This Week', type: 'this-week', isPreset: true },
		{ id: 'next-week', name: 'Next Week', type: 'next-week', isPreset: true },
		{ id: 'this-month', name: 'This Month', type: 'this-month', isPreset: true },
		{ id: 'next-month', name: 'Next Month', type: 'next-month', isPreset: true },
		{ id: 'all-tasks', name: 'All Tasks', type: 'all-tasks', isPreset: true }
	];
	selectedTimelineView: CustomTimelineView | null = null;
	lastRecurringCheck: number = 0;
	sortBy: SortOption = 'dueDate';
	globalClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.isMobile = this.checkIsMobile();
	}

	getViewType(): string {
		return VIEW_TYPE_TASK_MANAGER;
	}

	getDisplayText(): string {
		return 'Task Manager';
	}

	getIcon(): string {
		return 'checkmark';
	}

	async onOpen() {
		await this.loadTasks();
		this.setupFileWatcher();
		this.setupGlobalClickHandler();
		this.renderView();
	}

	async onClose() {
		// Cleanup file watcher
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
		}

		// Cleanup global click handler
		if (this.globalClickHandler) {
			document.removeEventListener('click', this.globalClickHandler);
			this.globalClickHandler = null;
		}

		// Return promise to satisfy async requirement
		return Promise.resolve();
	}

	checkIsMobile(): boolean {
		return window.innerWidth <= 768;
	}

	setupFileWatcher() {
		// Watch for changes to the task file
		this.fileWatcherRef = this.app.vault.on('modify', async (file) => {
			if (file.path === this.plugin.settings.taskFile) {
				await this.loadTasks();
				this.renderView();
			}
		});

		this.registerEvent(this.fileWatcherRef);
	}

	setupGlobalClickHandler() {
		// Single global click handler to close all task menus
		// This prevents memory leaks from adding one listener per task
		this.globalClickHandler = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			// Check if click is outside any task menu
			if (!target.closest('.task-menu-container')) {
				// Close all open menus
				document.querySelectorAll('.task-menu-dropdown').forEach(menu => {
					(menu as HTMLElement).style.display = 'none';
				});
			}
		};

		document.addEventListener('click', this.globalClickHandler);
	}

	async loadTasks() {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice(`Task file not found: ${this.plugin.settings.taskFile}`);
			this.tasks = [];
			return;
		}

		const content = await this.app.vault.read(file);
		this.tasks = this.parseTasks(content);

		// Check if we need to generate recurring tasks
		await this.checkAndGenerateRecurringTasks();

		// Add generated future tasks from recurring tasks
		const generatedTasks = this.generateFutureRecurringTasks();
		this.tasks = [...this.tasks, ...generatedTasks];
	}

	parseTasks(content: string): Task[] {
		const lines = content.split('\n');
		const tasks: Task[] = [];
		const taskIdentifier = this.plugin.settings.taskIdentifier;

		lines.forEach((line, index) => {
			// Check if line contains a checkbox and the task identifier
			if (line.includes('- [ ]') || line.includes('- [x]')) {
				if (line.includes(taskIdentifier)) {
					const task = this.parseTaskLine(line, index);
					if (task) {
						tasks.push(task);
					}
				}
			}
		});

		return tasks;
	}

	parseTaskLine(line: string, lineNumber: number): Task | null {
		// Determine status
		const isDone = line.includes('- [x]');
		const status: 'todo' | 'done' = isDone ? 'done' : 'todo';

		// Extract task name (text that's not metadata)
		let taskName = line.replace(/^[\s-]*\[[ x]\]\s*/, '');

		// Extract due date
		const dueMatch = line.match(/due::(\S+)/);
		const dueDate = dueMatch ? dueMatch[1] : null;

		// Extract ETA
		const etaMatch = line.match(/eta::(\d{1,2}:\d{2})/);
		const eta = etaMatch ? etaMatch[1] : null;

		// Extract recurring pattern
		const recurringMatch = line.match(/recurring::(\d+)(day|week|month|year)/);
		const isRecurring = recurringMatch !== null;
		const recurringPattern = recurringMatch ? recurringMatch[1] + recurringMatch[2] : null;

		// Extract recurring metadata
		const startingMatch = line.match(/starting::(\S+)/);
		const recurringStarting = startingMatch ? startingMatch[1] : null;

		const endingMatch = line.match(/ending::(\S+)/);
		const recurringEnding = endingMatch ? endingMatch[1] : null;

		// Extract wday (for weekly recurring)
		const wdayMatch = line.match(/wday::\[([^\]]+)]/);
		let recurringWDay: number[] | null = null;
		if (wdayMatch) {
			const days = wdayMatch[1].split(',').map(d => d.trim().toLowerCase());
			const dayMap: { [key: string]: number } = {
				'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
				'friday': 5, 'saturday': 6, 'sunday': 0
			};
			recurringWDay = days.map(d => dayMap[d]).filter(d => d !== undefined);
		}

		// Extract day (for monthly recurring)
		const dayMatch = line.match(/day::\[([^\]]+)]/);
		let recurringDay: number[] | null = null;
		if (dayMatch) {
			recurringDay = dayMatch[1].split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
		}

		// Extract month (for yearly recurring)
		const monthMatch = line.match(/month::\[([^\]]+)]/);
		let recurringMonth: string[] | null = null;
		if (monthMatch) {
			recurringMonth = monthMatch[1].split(',').map(m => m.trim());
		}

		// Extract priority label
		const priorityMatch = line.match(/priority::(\S+)/);
		const priority = priorityMatch ? priorityMatch[1] : null;

		// Extract tags and determine project/section
		const tagRegex = /#[\w/]+/g;
		const tags = line.match(tagRegex) || [];

		let project: string | null = null;
		let section: string | null = null;

		// Find the task identifier tag and extract project/section
		const taskIdentifier = this.plugin.settings.taskIdentifier;
		const projectTag = tags.find(tag => tag.startsWith(taskIdentifier));

		if (projectTag) {
			const parts = projectTag.substring(1).split('/'); // Remove # and split
			if (parts.length > 1) {
				project = parts[1]; // First level after identifier
			}
			if (parts.length > 2) {
				section = parts[2]; // Second level
			}
		}

		// Clean task name by removing metadata
		taskName = taskName
			.replace(/due::\S+/g, '')
			.replace(/eta::\S+/g, '')
			.replace(/priority::\S+/g, '')
			.replace(/recurring::\S+/g, '')
			.replace(/starting::\S+/g, '')
			.replace(/ending::\S+/g, '')
			.replace(/wday::\[([^\]]+)]/g, '')
			.replace(/day::\[([^\]]+)]/g, '')
			.replace(/month::\[([^\]]+)]/g, '')
			.replace(/#[\w/]+/g, '')
			.trim();

		return {
			lineNumber,
			taskName,
			dueDate,
			eta,
			project,
			section,
			tags,
			status,
			rawLine: line,
			isRecurring,
			recurringPattern,
			recurringStarting,
			recurringEnding,
			recurringWDay,
			recurringDay,
			recurringMonth,
			priority
		};
	}

	renderView() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('task-manager-container');

		// Check if mobile on each render (window might be resized)
		this.isMobile = this.checkIsMobile();

		if (this.isMobile) {
			this.renderMobileView(container);
		} else {
			this.renderDesktopView(container);
		}
	}

	renderDesktopView(container: HTMLElement) {
		// Create main layout
		const mainLayout = container.createDiv({ cls: 'task-manager-layout' });

		// Left navigation
		const leftNav = mainLayout.createDiv({ cls: 'task-manager-nav' });
		this.renderNavigation(leftNav);

		// Main content area
		const contentArea = mainLayout.createDiv({ cls: 'task-manager-content' });
		this.renderContent(contentArea);
	}

	renderMobileView(container: HTMLElement) {
		container.addClass('task-manager-mobile');

		// Check if we should show list or navigation
		if (this.selectedProject !== null || this.currentView === 'today' || this.currentView === 'done' || this.currentView === 'custom-timeline') {
			// Show task list with back button
			this.renderMobileTaskList(container);
		} else {
			// Show navigation cards
			this.renderMobileNavigation(container);
		}
	}

	renderMobileNavigation(container: HTMLElement) {
		const navContainer = container.createDiv({ cls: 'mobile-nav-container' });

		// New Task button (opens modal)
		const newTaskCard = navContainer.createDiv({ cls: 'mobile-nav-card new-task-card' });
		newTaskCard.createSpan({ text: '+ New Task', cls: 'mobile-nav-card-title' });
		newTaskCard.addEventListener('click', () => {
			this.showNewTaskModal();
		});

		// Today card
		const todayCard = navContainer.createDiv({ cls: 'mobile-nav-card' });
		todayCard.createSpan({ text: '📅 Today', cls: 'mobile-nav-card-title' });
		todayCard.addEventListener('click', () => {
			this.currentView = 'today';
			this.renderView();
		});

		// Custom timeline views
		this.customTimelineViews.forEach(view => {
			const timelineCard = navContainer.createDiv({ cls: 'mobile-nav-card' });
			timelineCard.createSpan({ text: `📆 ${view.name}`, cls: 'mobile-nav-card-title' });
			timelineCard.addEventListener('click', () => {
				this.currentView = 'custom-timeline';
				this.selectedTimelineView = view;
				this.renderView();
			});
		});

		// Done card
		const doneCard = navContainer.createDiv({ cls: 'mobile-nav-card' });
		doneCard.createSpan({ text: '✓ Done', cls: 'mobile-nav-card-title' });
		doneCard.addEventListener('click', () => {
			this.currentView = 'done';
			this.renderView();
		});

		// Projects header
		const projectsHeader = navContainer.createDiv({ cls: 'mobile-section-header' });
		projectsHeader.setText('Projects');

		// Get unique projects
		const projects = new Map<string, Set<string>>();
		this.tasks.forEach(task => {
			if (task.project) {
				if (!projects.has(task.project)) {
					projects.set(task.project, new Set());
				}
				if (task.section) {
					projects.get(task.project)?.add(task.section);
				}
			}
		});

		// Render project cards
		projects.forEach((sections, project) => {
			const projectCard = navContainer.createDiv({ cls: 'mobile-nav-card mobile-project-card' });

			const projectHeader = projectCard.createDiv({ cls: 'mobile-project-header' });
			projectHeader.createSpan({ text: `📁 ${project}`, cls: 'mobile-nav-card-title' });

			const hasSubprojects = sections.size > 0;
			const isExpanded = !this.collapsedProjects.has(project);

			if (hasSubprojects) {
				const toggleIcon = projectHeader.createSpan({
					cls: 'mobile-toggle-icon',
					text: isExpanded ? '▼' : '▶'
				});

				toggleIcon.addEventListener('click', (e) => {
					e.stopPropagation();
					if (this.collapsedProjects.has(project)) {
						this.collapsedProjects.delete(project);
					} else {
						this.collapsedProjects.add(project);
					}
					this.renderView();
				});
			}

			// Click on project header to view tasks
			projectHeader.addEventListener('click', (e) => {
				if (!(e.target as HTMLElement).classList.contains('mobile-toggle-icon')) {
					this.currentView = 'projects';
					this.selectedProject = project;
					this.selectedSection = null;
					this.renderView();
				}
			});

			// Show subprojects if expanded
			if (hasSubprojects && isExpanded) {
				const subprojectsContainer = projectCard.createDiv({ cls: 'mobile-subprojects' });
				sections.forEach(section => {
					const sectionCard = subprojectsContainer.createDiv({ cls: 'mobile-subproject-item' });
					sectionCard.createSpan({ text: `└ ${section}` });
					sectionCard.addEventListener('click', () => {
						this.currentView = 'projects';
						this.selectedProject = project;
						this.selectedSection = section;
						this.renderView();
					});
				});
			}
		});
	}

	renderMobileTaskList(container: HTMLElement) {
		// Back button
		const header = container.createDiv({ cls: 'mobile-header' });
		const backBtn = header.createDiv({ cls: 'mobile-back-btn', text: '← Back' });
		backBtn.addEventListener('click', () => {
			this.selectedProject = null;
			this.selectedSection = null;
			this.currentView = 'projects';
			this.renderView();
		});

		const title = this.currentView === 'today' ? 'Today' :
					  this.currentView === 'done' ? 'Done' :
					  this.selectedSection ? `${this.selectedProject} / ${this.selectedSection}` :
					  this.selectedProject || 'Tasks';

		header.createDiv({ cls: 'mobile-title', text: title });

		// Add New Task button in header
		const addTaskBtn = header.createDiv({ cls: 'mobile-add-task-btn', text: '+' });
		addTaskBtn.addEventListener('click', () => {
			this.showNewTaskModal();
		});

		// Content area
		const contentArea = container.createDiv({ cls: 'mobile-content' });
		this.renderContent(contentArea);
	}

	renderNavigation(navEl: HTMLElement) {
		navEl.empty();

		// New Task button at top
		const newTaskBtn = navEl.createDiv({ cls: 'nav-item new-task-btn' });
		newTaskBtn.createSpan({ text: '+ New Task', cls: 'new-task-text' });
		newTaskBtn.addEventListener('click', async () => {
			await this.createNewTask();
			await this.loadTasks();
			this.renderView();
		});

		// Today button
		const todayBtn = navEl.createDiv({
			cls: this.currentView === 'today' ? 'nav-item active' : 'nav-item'
		});
		todayBtn.setText('📅 Today');
		todayBtn.addEventListener('click', () => {
			this.currentView = 'today';
			this.selectedProject = null;
			this.selectedSection = null;
			this.selectedTimelineView = null;
			this.renderView();
		});

		// Custom timeline views section
		const timelineHeader = navEl.createDiv({ cls: 'nav-header timeline-header' });
		timelineHeader.createSpan({ text: 'Timeline' });
		const addTimelineBtn = timelineHeader.createSpan({ cls: 'add-timeline-btn', text: '+' });
		addTimelineBtn.addEventListener('click', () => {
			this.showAddTimelineDialog();
		});

		// Render existing timeline views
		this.customTimelineViews.forEach((view, index) => {
			const viewContainer = navEl.createDiv({ cls: 'timeline-view-container' });
			const viewItem = viewContainer.createDiv({
				cls: this.selectedTimelineView?.id === view.id ? 'nav-item timeline-view-item active' : 'nav-item timeline-view-item'
			});

			viewItem.createSpan({ text: `📆 ${view.name}`, cls: 'timeline-view-name' });

			viewItem.addEventListener('click', (e) => {
				// Don't trigger view change if clicking on action buttons
				if (!(e.target as HTMLElement).classList.contains('timeline-action-btn')) {
					this.currentView = 'custom-timeline';
					this.selectedProject = null;
					this.selectedSection = null;
					this.selectedTimelineView = view;
					this.renderView();
				}
			});

			// Add edit/delete buttons for custom views (not presets)
			if (!view.isPreset) {
				const actionsContainer = viewItem.createDiv({ cls: 'timeline-actions' });

				const editBtn = actionsContainer.createSpan({ text: '✎', cls: 'timeline-action-btn edit-btn' });
				editBtn.setAttribute('title', 'Edit');
				editBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.showEditTimelineDialog(view, index);
				});

				const deleteBtn = actionsContainer.createSpan({ text: '✕', cls: 'timeline-action-btn delete-btn' });
				deleteBtn.setAttribute('title', 'Delete');
				deleteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.deleteTimelineView(index);
				});
			}
		});

		// Done button
		const doneBtn = navEl.createDiv({
			cls: this.currentView === 'done' ? 'nav-item active' : 'nav-item'
		});
		doneBtn.setText('✓ Done');
		doneBtn.addEventListener('click', () => {
			this.currentView = 'done';
			this.selectedProject = null;
			this.selectedSection = null;
			this.selectedTimelineView = null;
			this.renderView();
		});

		// Projects section
		const projectsHeader = navEl.createDiv({ cls: 'nav-header' });
		projectsHeader.setText('Projects');

		// Get unique projects (excluding completed tasks)
		const projects = new Map<string, Set<string>>();
		this.tasks.filter(task => task.status !== 'done').forEach(task => {
			if (task.project) {
				if (!projects.has(task.project)) {
					projects.set(task.project, new Set());
				}
				if (task.section) {
					projects.get(task.project)?.add(task.section);
				}
			}
		});

		// Render projects
		projects.forEach((sections, project) => {
			const isActive = this.selectedProject === project && !this.selectedSection;
			const hasSubprojects = sections.size > 0;
			const isExpanded = !this.collapsedProjects.has(project);

			const projectItem = navEl.createDiv({
				cls: isActive ? 'nav-item project-item active' : 'nav-item project-item'
			});

			// Add toggle icon if has subprojects
			if (hasSubprojects) {
				const toggleIcon = projectItem.createSpan({
					cls: 'toggle-icon',
					text: isExpanded ? '▼' : '▶'
				});
				toggleIcon.addEventListener('click', (e) => {
					e.stopPropagation();
					if (this.collapsedProjects.has(project)) {
						this.collapsedProjects.delete(project);
					} else {
						this.collapsedProjects.add(project);
					}
					this.renderView();
				});
			}

			projectItem.createSpan({ text: `📁 ${project}` });

			projectItem.addEventListener('click', () => {
				this.currentView = 'projects';
				this.selectedProject = project;
				this.selectedSection = null;
				this.renderView();
			});

			// Render sections only if expanded
			if (hasSubprojects && isExpanded) {
				sections.forEach(section => {
					const isActive = this.selectedProject === project && this.selectedSection === section;
					const sectionItem = navEl.createDiv({
						cls: isActive ? 'nav-item section-item active' : 'nav-item section-item'
					});
					sectionItem.setText(`  └ ${section}`);

					sectionItem.addEventListener('click', () => {
						this.currentView = 'projects';
						this.selectedProject = project;
						this.selectedSection = section;
						this.renderView();
					});
				});
			}
		});
	}

	renderContent(contentEl: HTMLElement) {
		contentEl.empty();

		if (this.currentView === 'today') {
			this.renderTodayView(contentEl);
		} else if (this.currentView === 'done') {
			this.renderDoneView(contentEl);
		} else if (this.currentView === 'custom-timeline') {
			this.renderCustomTimelineView(contentEl);
		} else if (this.currentView === 'projects') {
			this.renderProjectView(contentEl);
		}
	}

	// Render sorting dropdown
	renderSortDropdown(container: HTMLElement) {
		const sortContainer = container.createDiv({ cls: 'sort-container' });
		sortContainer.createSpan({ text: 'Sort by: ', cls: 'sort-label' });

		const sortSelect = sortContainer.createEl('select', { cls: 'sort-select' });

		const options = [
			{ value: 'dueDate', text: 'Due Date' },
			{ value: 'duration', text: 'Duration' },
			{ value: 'alphabetical', text: 'Alphabetical' },
			{ value: 'project', text: 'Project' },
			{ value: 'priority', text: 'Priority' }
		];

		options.forEach(opt => {
			const option = sortSelect.createEl('option', {
				value: opt.value,
				text: opt.text
			});
			if (this.sortBy === opt.value) {
				option.selected = true;
			}
		});

		sortSelect.addEventListener('change', () => {
			this.sortBy = sortSelect.value as SortOption;
			this.renderView();
		});
	}

	renderTodayView(contentEl: HTMLElement) {
		const header = contentEl.createDiv({ cls: 'content-header' });
		header.createEl('h2', { text: 'Today' });

		// Add sorting dropdown
		this.renderSortDropdown(header);

		// Filter tasks due today (exclude completed)
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = this.formatDate(today);

		const todayTasks = this.tasks.filter(task => {
			if (task.status === 'done') return false;
			if (!task.dueDate) return false;

			// For recurring templates: only hide if there's a materialized occurrence
			if (task.isRecurring && !task.isGeneratedRecurring) {
				const hasMaterialized = this.tasks.some(t =>
					!t.isRecurring &&
					t.taskName === task.taskName &&
					t.dueDate === task.dueDate
				);
				if (hasMaterialized) return false; // Hide template if occurrence exists
			}

			return task.dueDate === todayStr || this.isOverdue(task.dueDate);
		});

		// Sort tasks
		const sortedTasks = this.sortTasks(todayTasks);

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(sortedTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		sortedTasks.forEach(task => {
			this.renderTask(taskList, task);
		});

		if (todayTasks.length === 0) {
			taskList.createDiv({ text: 'No tasks due today', cls: 'empty-state' });
		}
	}

	renderDoneView(contentEl: HTMLElement) {
		const header = contentEl.createDiv({ cls: 'content-header' });
		header.createEl('h2', { text: 'Done' });

		// Add sorting dropdown
		this.renderSortDropdown(header);

		// Filter completed tasks (exclude recurring templates)
		const doneTasks = this.tasks.filter(task => {
			if (task.status !== 'done') return false;

			// For recurring templates: only hide if there's a materialized occurrence
			if (task.isRecurring && !task.isGeneratedRecurring) {
				const hasMaterialized = this.tasks.some(t =>
					!t.isRecurring &&
					t.taskName === task.taskName &&
					t.dueDate === task.dueDate
				);
				if (hasMaterialized) return false;
			}

			return true;
		});

		// Sort tasks
		const sortedTasks = this.sortTasks(doneTasks);

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(sortedTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		sortedTasks.forEach(task => {
			this.renderTask(taskList, task);
		});

		if (doneTasks.length === 0) {
			taskList.createDiv({ text: 'No completed tasks', cls: 'empty-state' });
		}
	}

	renderProjectView(contentEl: HTMLElement) {
		const header = contentEl.createDiv({ cls: 'content-header' });
		const title = this.selectedSection
			? `${this.selectedProject} / ${this.selectedSection}`
			: this.selectedProject || 'Projects';
		header.createEl('h2', { text: title });

		// Add sorting dropdown
		this.renderSortDropdown(header);

		// Filter tasks by project/section (exclude completed and recurring templates with occurrences)
		let filteredTasks = this.tasks.filter(task => {
			if (task.status === 'done') return false;

			// For recurring templates: only hide if there's a materialized occurrence
			if (task.isRecurring && !task.isGeneratedRecurring) {
				const hasMaterialized = this.tasks.some(t =>
					!t.isRecurring &&
					t.taskName === task.taskName &&
					t.dueDate === task.dueDate
				);
				if (hasMaterialized) return false;
			}

			return true;
		});
		if (this.selectedProject) {
			filteredTasks = filteredTasks.filter(task => task.project === this.selectedProject);
		}
		if (this.selectedSection) {
			filteredTasks = filteredTasks.filter(task => task.section === this.selectedSection);
		}

		// Sort tasks
		const sortedTasks = this.sortTasks(filteredTasks);

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(sortedTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		sortedTasks.forEach(task => {
			this.renderTask(taskList, task);
		});

		if (filteredTasks.length === 0) {
			taskList.createDiv({ text: 'No tasks in this project', cls: 'empty-state' });
		}
	}

	renderTask(container: HTMLElement, task: Task) {
		const taskEl = container.createDiv({ cls: 'task-item' });

		// Checkbox
		const checkbox = taskEl.createEl('input', { type: 'checkbox' });
		checkbox.checked = task.status === 'done';
		checkbox.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.toggleTask(task);
		});

		// Task content
		const taskContent = taskEl.createDiv({ cls: 'task-content' });

		// Three-dot menu for desktop
		const menuContainer = taskEl.createDiv({ cls: 'task-menu-container' });
		const menuButton = menuContainer.createDiv({ cls: 'task-menu-button', text: '⋯' });
		const menuDropdown = menuContainer.createDiv({ cls: 'task-menu-dropdown' });
		menuDropdown.style.display = 'none';

		const deleteOption = menuDropdown.createDiv({ cls: 'task-menu-option', text: '🗑️ Delete' });
		deleteOption.addEventListener('click', async (e) => {
			e.stopPropagation();
			menuDropdown.style.display = 'none';
			await this.deleteTask(task);
		});

		// Toggle menu on button click
		menuButton.addEventListener('click', (e) => {
			e.stopPropagation();
			const isVisible = menuDropdown.style.display === 'block';
			// Hide all other menus first
			document.querySelectorAll('.task-menu-dropdown').forEach(menu => {
				(menu as HTMLElement).style.display = 'none';
			});
			menuDropdown.style.display = isVisible ? 'none' : 'block';
		});

		// Note: Menu closing on outside click is handled by global click handler in setupGlobalClickHandler()
		// This prevents memory leaks from adding one document listener per task

		// Long-press for mobile
		let longPressTimer: NodeJS.Timeout | null = null;
		let touchStarted = false;

		taskEl.addEventListener('touchstart', (e) => {
			touchStarted = true;
			longPressTimer = setTimeout(() => {
				if (touchStarted) {
					// Trigger long-press action
					e.preventDefault();
					new ConfirmModal(
						this.app,
						`Delete task "${task.taskName}"?`,
						async () => {
							await this.deleteTask(task);
						}
					).open();
				}
			}, 800); // 800ms for long press
		});

		taskEl.addEventListener('touchend', () => {
			touchStarted = false;
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		});

		taskEl.addEventListener('touchmove', () => {
			touchStarted = false;
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		});

		// Task name (editable with internal link support)
		const taskNameEl = taskContent.createDiv({ cls: 'task-name' });

		let isEditing = false;

		// Convert [[note]] links to clickable links using DOM
		const renderTaskName = (name: string, container: HTMLElement) => {
			container.empty();
			const parts = name.split(/(\[\[[^\]]+\]\])/g);

			parts.forEach(part => {
				if (part.startsWith('[[') && part.endsWith(']]')) {
					// Extract note name
					const noteName = part.slice(2, -2);
					const link = container.createEl('a', {
						text: noteName,
						cls: 'internal-link',
						href: '#'
					});
					link.setAttribute('data-note', noteName);
				} else if (part) {
					container.appendText(part);
				}
			});
		};

		// Render the task name with links
		const updateTaskNameDisplay = () => {
			if (!isEditing) {
				renderTaskName(task.taskName, taskNameEl);
				taskNameEl.contentEditable = 'false';
			}
		};

		updateTaskNameDisplay();

		// Handle internal link clicks and double-click to edit
		taskNameEl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('internal-link')) {
				e.preventDefault();
				e.stopPropagation();
				const noteName = target.getAttribute('data-note');
				if (noteName) {
					// Open the note in Obsidian
					const file = this.app.vault.getAbstractFileByPath(noteName + '.md');
					if (file instanceof TFile) {
						this.app.workspace.getLeaf().openFile(file).catch(console.error);
					} else {
						// Try to find the file by name
						const files = this.app.vault.getMarkdownFiles();
						const foundFile = files.find(f => f.basename === noteName);
						if (foundFile) {
							this.app.workspace.getLeaf().openFile(foundFile).catch(console.error);
						} else {
							new Notice(`Note "${noteName}" not found`);
						}
					}
				}
			}
		});

		// Double-click to edit
		taskNameEl.addEventListener('dblclick', (e) => {
			const target = e.target as HTMLElement;
			// Don't edit if clicking on a link
			if (!target.classList.contains('internal-link')) {
				isEditing = true;
				taskNameEl.contentEditable = 'true';
				taskNameEl.innerText = task.taskName; // Show raw text with [[brackets]]
				taskNameEl.focus();
				// Select all text
				const range = document.createRange();
				range.selectNodeContents(taskNameEl);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);
			}
		});

		taskNameEl.addEventListener('blur', async () => {
			if (isEditing) {
				isEditing = false;
				taskNameEl.contentEditable = 'false';

				// Get the raw text content with [[links]]
				let newName = taskNameEl.innerText.trim();

				// Check if the content has changed
				if (newName !== task.taskName) {
					task.taskName = newName;
					await this.updateTask(task);
				}

				// Re-render with formatted links
				updateTaskNameDisplay();
			}
		});

		taskNameEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && isEditing) {
				e.preventDefault();
				taskNameEl.blur();
			} else if (e.key === 'Escape' && isEditing) {
				e.preventDefault();
				isEditing = false;
				taskNameEl.contentEditable = 'false';
				updateTaskNameDisplay();
			}
		});

		// Metadata
		const metadata = taskContent.createDiv({ cls: 'task-metadata' });

		// Due date (editable with date picker)
		if (task.dueDate) {
			const dueEl = metadata.createSpan({ cls: 'task-due' });
			dueEl.appendText('📅 ');
			const dateSpan = dueEl.createSpan({
				text: task.dueDate,
				cls: 'editable-date'
			});

			if (this.isOverdue(task.dueDate)) {
				dueEl.addClass('overdue');
			}

			// When clicked, replace with date input
			dateSpan?.addEventListener('click', () => {
				const dateInput = document.createElement('input');
				dateInput.type = 'date';
				dateInput.value = task.dueDate || '';
				dateInput.className = 'editable-date-input';

				// Replace span with input
				dateSpan.replaceWith(dateInput);
				dateInput.focus();

				// Handle save
				const saveDate = async () => {
					const newDate = dateInput.value;
					if (newDate && newDate !== task.dueDate) {
						task.dueDate = newDate;
						await this.updateTask(task);
						this.renderView();
					} else if (!newDate) {
						// If cleared, just restore original
						this.renderView();
					} else {
						// No change, just restore
						this.renderView();
					}
				};

				dateInput.addEventListener('blur', saveDate);
				dateInput.addEventListener('change', saveDate);
				dateInput.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						dateInput.blur();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						this.renderView(); // Cancel editing
					}
				});
			});
		} else {
			// Add due date button
			const addDueBtn = metadata.createSpan({ cls: 'task-add-due', text: '+ Due' });
			addDueBtn.addEventListener('click', async () => {
				const today = this.formatDate(new Date());
				task.dueDate = today;
				await this.updateTask(task);
				this.renderView();
			});
		}

		// Priority Label
		if (task.priority) {
			const priorityLabel = this.plugin.settings.priorityLabels.find(l => l.id === task.priority);
			if (priorityLabel) {
				const priorityEl = metadata.createSpan({ cls: 'task-priority' });
				priorityEl.style.backgroundColor = priorityLabel.color;
				priorityEl.style.color = '#fff';
				priorityEl.style.padding = '2px 8px';
				priorityEl.style.borderRadius = '4px';
				priorityEl.style.fontSize = '0.85em';
				priorityEl.style.fontWeight = '500';
				priorityEl.setText(priorityLabel.name);

				// Click to change priority
				priorityEl.style.cursor = 'pointer';
				priorityEl.addEventListener('click', async () => {
					// Create a dropdown to change priority
					const dropdown = document.createElement('select');
					dropdown.style.position = 'absolute';
					dropdown.style.zIndex = '1000';

					// Add "No priority" option
					const noneOption = dropdown.createEl('option', { value: '' });
					noneOption.setText('No priority');

					// Add all priority options
					this.plugin.settings.priorityLabels.forEach(label => {
						const option = dropdown.createEl('option', { value: label.id });
						option.setText(label.name);
						if (label.id === task.priority) {
							option.selected = true;
						}
					});

					dropdown.addEventListener('change', async () => {
						task.priority = dropdown.value || null;
						await this.updateTask(task);
						this.renderView();
					});

					priorityEl.appendChild(dropdown);
					dropdown.focus();
					dropdown.addEventListener('blur', () => {
						dropdown.remove();
					});
				});
			}
		} else {
			// Add priority button
			const addPriorityBtn = metadata.createSpan({ cls: 'task-add-priority', text: '+ Priority' });
			addPriorityBtn.addEventListener('click', async () => {
				// Set to first priority label if available
				if (this.plugin.settings.priorityLabels.length > 0) {
					task.priority = this.plugin.settings.priorityLabels[0].id;
					await this.updateTask(task);
					this.renderView();
				}
			});
		}

		// ETA (editable)
		if (task.eta) {
			const etaEl = metadata.createSpan({ cls: 'task-eta' });
			etaEl.appendText('⏱️ ');
			const etaSpan = etaEl.createSpan({
				text: task.eta,
				cls: 'editable-eta'
			});
			etaSpan.contentEditable = 'true';

			etaSpan?.addEventListener('blur', async () => {
				const newEta = etaSpan.getText().trim();
				if (newEta !== task.eta && this.isValidEta(newEta)) {
					task.eta = newEta;
					await this.updateTask(task);
					this.renderView();
				} else if (!this.isValidEta(newEta)) {
					new Notice('Invalid ETA format. Use H:MM or HH:MM');
					etaSpan.setText(task.eta || '');
				}
			});

			etaSpan?.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					etaSpan.blur();
				}
			});
		} else {
			// Add ETA button
			const addEtaBtn = metadata.createSpan({ cls: 'task-add-eta', text: '+ ETA' });
			addEtaBtn.addEventListener('click', async () => {
				task.eta = '1:00';
				await this.updateTask(task);
				this.renderView();
			});
		}

		// Project/Section (editable)
		const projectEl = metadata.createSpan({ cls: 'task-project' });
		const projectText = task.project
			? (task.section ? `${task.project}/${task.section}` : task.project)
			: '';

		projectEl.appendText('📁 ');
		const projectSpan = projectEl.createSpan({
			text: projectText,
			cls: 'editable-project'
		});
		projectSpan.contentEditable = 'true';

		projectSpan?.addEventListener('blur', async () => {
			const newProject = projectSpan.getText().trim();
			const oldProject = task.project
				? (task.section ? `${task.project}/${task.section}` : task.project)
				: '';

			if (newProject !== oldProject) {
				// Parse project/section from input
				const parts = newProject.split('/');
				task.project = parts[0] || null;
				task.section = parts[1] || null;
				await this.updateTask(task);
				this.renderView();
			}
		});

		projectSpan?.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				projectSpan.blur();
			}
		});

		// Recurring indicator/editor
		// Check if this task is a recurring template OR an occurrence of a recurring task
		const templateTask = task.isRecurring && !task.isGeneratedRecurring
			? task  // This IS the template
			: this.tasks.find(t =>  // Find the template for this occurrence
				t.isRecurring &&
				!t.isGeneratedRecurring &&
				t.taskName === task.taskName &&
				t.project === task.project &&
				t.section === task.section
			);

		if (templateTask) {
			// This is either a template or an occurrence - show recurring icon
			const recurringEl = metadata.createSpan({ cls: 'task-recurring' });
			recurringEl.setText(`🔄 ${templateTask.recurringPattern}`);
			recurringEl.addEventListener('click', () => {
				// Always edit the template, even if clicked on an occurrence
				this.showRecurringEditor(templateTask);
			});
		} else {
			// This is a regular non-recurring task - show "Add Recurring" button
			const addRecurringBtn = metadata.createSpan({ cls: 'task-add-recurring', text: '+ Recurring' });
			addRecurringBtn.addEventListener('click', () => {
				this.showRecurringEditor(task);
			});
		}
	}

	async toggleTask(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		if (task.status === 'todo') {
			// COMPLETING A TASK

			// Check if this is a virtual (not materialized) recurring task
			if (task.isGeneratedRecurring && task.lineNumber === -1) {
				// This is a virtual recurring task - need to find the template and generate next occurrence
				const templateTask = this.tasks.find(t =>
					t.isRecurring &&
					!t.isGeneratedRecurring &&
					t.taskName === task.taskName &&
					t.project === task.project &&
					t.section === task.section
				);

				if (templateTask && task.dueDate) {
					// Materialize the current occurrence as done and add next occurrence
					const currentTaskLine = this.buildRecurringTaskInstance(task, task.dueDate).replace('- [ ]', '- [x]');
					// Calculate next occurrence AFTER the current due date
					const nextOccurrence = this.calculateNextOccurrenceAfterDate(templateTask, task.dueDate);

					if (nextOccurrence) {
						const nextTaskLine = this.buildRecurringTaskInstance(templateTask, nextOccurrence);

						// Add completed task at bottom
						lines.push('');
						lines.push(currentTaskLine);

						// Add next occurrence at top (after headers)
						let insertIndex = 0;
						for (let i = 0; i < lines.length; i++) {
							if (!lines[i].startsWith('#') && lines[i].trim() !== '') {
								insertIndex = i;
								break;
							}
						}
						lines.splice(insertIndex, 0, nextTaskLine);

						new Notice(`Task completed! Next occurrence: ${nextOccurrence}`);
					}
				}
			} else if (task.lineNumber >= 0 && task.lineNumber < lines.length) {
				// This is a real task in the file (materialized occurrence or regular task)
				const line = lines[task.lineNumber];
				const completedLine = line.replace('- [ ]', '- [x]');

				// Remove from current position
				lines.splice(task.lineNumber, 1);

				// Check if this task is part of a recurring series (find matching template)
				const templateTask = this.tasks.find(t =>
					t.isRecurring &&
					!t.isGeneratedRecurring &&
					t.taskName === task.taskName &&
					t.project === task.project &&
					t.section === task.section
				);

				if (templateTask && task.dueDate) {
					// This is a recurring occurrence - generate next one AFTER current due date
					const nextOccurrence = this.calculateNextOccurrenceAfterDate(templateTask, task.dueDate);

					if (nextOccurrence) {
						const nextTaskLine = this.buildRecurringTaskInstance(templateTask, nextOccurrence);

						// Add next occurrence at top (after headers)
						let insertIndex = 0;
						for (let i = 0; i < lines.length; i++) {
							if (!lines[i].startsWith('#') && lines[i].trim() !== '') {
								insertIndex = i;
								break;
							}
						}
						lines.splice(insertIndex, 0, nextTaskLine);

						new Notice(`Task completed! Next occurrence: ${nextOccurrence}`);
					}
				}

				// Add completed task at bottom
				lines.push('');
				lines.push(completedLine);
			}
		} else {
			// UNCOMPLETING A TASK
			if (task.lineNumber >= 0 && task.lineNumber < lines.length) {
				const line = lines[task.lineNumber];
				lines[task.lineNumber] = line.replace('- [x]', '- [ ]');
			}
		}

		await this.app.vault.modify(file, lines.join('\n'));
		await this.loadTasks();
		this.renderView();
	}

	async updateTask(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		if (task.lineNumber < lines.length) {
			// Reconstruct the task line with updated values
			const checkbox = task.status === 'done' ? '- [x]' : '- [ ]';
			const taskIdentifier = this.plugin.settings.taskIdentifier;

			// Build the project/section tag - ALWAYS include at least the base tag
			let projectTag = taskIdentifier;
			if (task.project) {
				projectTag += '/' + task.project;
				if (task.section) {
					projectTag += '/' + task.section;
				}
			}

			// Build the complete line
			let newLine = `${checkbox} ${task.taskName}`;

			if (task.dueDate) {
				newLine += ` due::${task.dueDate}`;
			}

			if (task.eta) {
				newLine += ` eta::${task.eta}`;
			}

			if (task.priority) {
				newLine += ` priority::${task.priority}`;
			}

			// ALWAYS add the tag (even if just #tlog)
			newLine += ` ${projectTag}`;

			// Add recurring fields if this is a recurring task
			if (task.isRecurring && !task.isGeneratedRecurring) {
				newLine += ` recurring::${task.recurringPattern}`;

				if (task.recurringStarting) {
					newLine += ` starting::${task.recurringStarting}`;
				}

				if (task.recurringEnding) {
					newLine += ` ending::${task.recurringEnding}`;
				}

				if (task.recurringWDay && task.recurringWDay.length > 0) {
					const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
					const days = task.recurringWDay.map(d => dayNames[d]).join(',');
					newLine += ` wday::[${days}]`;
				}

				if (task.recurringDay && task.recurringDay.length > 0) {
					newLine += ` day::[${task.recurringDay.join(',')}]`;
				}

				if (task.recurringMonth && task.recurringMonth.length > 0) {
					newLine += ` month::[${task.recurringMonth.join(',')}]`;
				}
			}

			lines[task.lineNumber] = newLine;
			await this.app.vault.modify(file, lines.join('\n'));
			await this.loadTasks();
		}
	}

	async deleteTask(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		// Confirm deletion
		new ConfirmModal(
			this.app,
			`Delete task "${task.taskName}"?`,
			async () => {
				const content = await this.app.vault.read(file);
				const lines = content.split('\n');

				if (task.lineNumber >= 0 && task.lineNumber < lines.length) {
					// Remove the line
					lines.splice(task.lineNumber, 1);
					await this.app.vault.modify(file, lines.join('\n'));
					await this.loadTasks();
					this.renderView();
					new Notice(`Deleted task "${task.taskName}"`);
				} else {
					new Notice('Cannot delete virtual task');
				}
			}
		).open();
	}

	isValidDate(dateStr: string): boolean {
		// Check format YYYY-MM-DD
		const regex = /^\d{4}-\d{2}-\d{2}$/;
		if (!regex.test(dateStr)) return false;

		// Check if it's a valid date
		const date = new Date(dateStr);
		return date instanceof Date && !isNaN(date.getTime());
	}

	isValidEta(etaStr: string): boolean {
		// Check format H:MM or HH:MM
		const regex = /^\d{1,2}:\d{2}$/;
		if (!regex.test(etaStr)) return false;

		// Check if hours and minutes are valid
		const [hours, minutes] = etaStr.split(':').map(Number);
		return hours >= 0 && hours <= 99 && minutes >= 0 && minutes <= 59;
	}

	calculateTotalEta(tasks: Task[]): string {
		let totalMinutes = 0;

		tasks.forEach(task => {
			if (task.eta) {
				const [hours, minutes] = task.eta.split(':').map(Number);
				totalMinutes += hours * 60 + minutes;
			}
		});

		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		return `${hours}h ${minutes}m`;
	}

	formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	isOverdue(dueDate: string): boolean {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const due = new Date(dueDate);
		return due < today;
	}

	// Sorting methods
	sortTasks(tasks: Task[]): Task[] {
		const sorted = [...tasks]; // Create a copy to avoid mutating original

		switch (this.sortBy) {
			case 'dueDate':
				return sorted.sort((a, b) => {
					// No due date goes last
					if (!a.dueDate && !b.dueDate) return 0;
					if (!a.dueDate) return 1;
					if (!b.dueDate) return -1;
					// Compare dates
					return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
				});

			case 'duration':
				return sorted.sort((a, b) => {
					// Convert ETA to minutes for comparison
					const getMinutes = (eta: string | null): number => {
						if (!eta) return 0;
						const match = eta.match(/^(\d+):(\d+)$/);
						if (!match) return 0;
						return parseInt(match[1]) * 60 + parseInt(match[2]);
					};

					const aMinutes = getMinutes(a.eta);
					const bMinutes = getMinutes(b.eta);

					// No ETA goes last
					if (aMinutes === 0 && bMinutes === 0) return 0;
					if (aMinutes === 0) return 1;
					if (bMinutes === 0) return -1;
					// Sort by duration (longest first)
					return bMinutes - aMinutes;
				});

			case 'alphabetical':
				return sorted.sort((a, b) => {
					return a.taskName.localeCompare(b.taskName);
				});

			case 'project':
				return sorted.sort((a, b) => {
					// Build full project path
					const getProjectPath = (task: Task): string => {
						if (!task.project) return '';
						if (task.section) return `${task.project}/${task.section}`;
						return task.project;
					};

					const aPath = getProjectPath(a);
					const bPath = getProjectPath(b);

					// No project goes last
					if (!aPath && !bPath) return 0;
					if (!aPath) return 1;
					if (!bPath) return -1;
					// Compare project paths
					return aPath.localeCompare(bPath);
				});

			case 'priority':
				return sorted.sort((a, b) => {
					// Get priority order from settings
					const getPriorityOrder = (task: Task): number => {
						if (!task.priority) return 9999; // No priority goes last
						const label = this.plugin.settings.priorityLabels.find(l => l.id === task.priority);
						return label ? label.order : 9999;
					};

					const aOrder = getPriorityOrder(a);
					const bOrder = getPriorityOrder(b);

					// Sort by priority order (lower order = higher priority = comes first)
					return aOrder - bOrder;
				});

			default:
				return sorted;
		}
	}

	async createNewTask() {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Determine due date and project based on current view
		const today = this.formatDate(new Date());
		const taskIdentifier = this.plugin.settings.taskIdentifier;
		let dueDate = '';
		let projectTag = taskIdentifier;

		// Set due date based on current view
		if (this.currentView === 'today') {
			dueDate = `due::${today}`;
		} else if (this.currentView === 'custom-timeline' && this.selectedTimelineView) {
			// For timeline views, set due date to today by default
			dueDate = `due::${today}`;
		} else if (this.currentView === 'done') {
			// For done view, just use today
			dueDate = `due::${today}`;
		}
		// For 'projects' view without due date, don't add due date

		// Set project tag based on selected project/section
		if (this.selectedProject) {
			projectTag += '/' + this.selectedProject;
			if (this.selectedSection) {
				projectTag += '/' + this.selectedSection;
			}
		}

		// Build the new task line
		const newTaskLine = `- [ ] New Task ${dueDate} eta::1:00 ${projectTag}`.trim().replace(/\s+/g, ' ');

		// Find first non-header line or insert at beginning
		let insertIndex = 0;
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].startsWith('#') && lines[i].trim() !== '') {
				insertIndex = i;
				break;
			}
		}

		lines.splice(insertIndex, 0, newTaskLine);
		await this.app.vault.modify(file, lines.join('\n'));

		const context = this.selectedProject
			? `in ${this.selectedProject}${this.selectedSection ? '/' + this.selectedSection : ''}`
			: this.currentView;
		new Notice(`New task created ${context}!`);
	}

	async checkAndGenerateRecurringTasks() {
		// Check if enough time has passed since last check (daily heartbeat)
		const now = Date.now();
		const oneDay = 24 * 60 * 60 * 1000;

		if (now - this.lastRecurringCheck < oneDay) {
			return; // Don't check too frequently
		}

		this.lastRecurringCheck = now;

		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);
		if (!file || !(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Find recurring tasks that need to be materialized
		const recurringTasks = this.tasks.filter(t => t.isRecurring && !t.isGeneratedRecurring);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		let newTasksToAdd: string[] = [];

		for (const recurringTask of recurringTasks) {
			const nextOccurrences = this.calculateNextOccurrences(recurringTask, 2); // Get next 2 occurrences

			for (const occurrence of nextOccurrences) {
				const occurrenceDate = new Date(occurrence);
				occurrenceDate.setHours(0, 0, 0, 0);

				// Create actual task entry if due today or tomorrow
				if (occurrenceDate <= tomorrow) {
					// Check if this occurrence already exists in the file
					const occurrenceDateStr = this.formatDate(occurrenceDate);
					const taskExists = this.tasks.some(t =>
						t.taskName === recurringTask.taskName &&
						t.dueDate === occurrenceDateStr &&
						!t.isRecurring
					);

					if (!taskExists) {
						// Create new task line
						const newTask = this.buildRecurringTaskInstance(recurringTask, occurrenceDateStr);
						newTasksToAdd.push(newTask);
					}
				}
			}
		}

		// Add new tasks to the bottom of the file
		if (newTasksToAdd.length > 0) {
			const updatedContent = content + '\n' + newTasksToAdd.join('\n');
			await this.app.vault.modify(file, updatedContent);
		}
	}

	generateFutureRecurringTasks(): Task[] {
		const generatedTasks: Task[] = [];
		const recurringTasks = this.tasks.filter(t => t.isRecurring && !t.isGeneratedRecurring);

		for (const recurringTask of recurringTasks) {
			// Only generate the NEXT occurrence (not yet materialized)
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
						lineNumber: -1, // Virtual task, no line number
						rawLine: ''
					};

					generatedTasks.push(virtualTask);
				}
			}
		}

		return generatedTasks;
	}

	calculateNextOccurrences(task: Task, count: number): string[] {
		if (!task.isRecurring || !task.recurringPattern) return [];

		const occurrences: string[] = [];
		const match = task.recurringPattern.match(/^(\d+)(day|week|month|year)$/);

		if (!match) return [];

		const interval = parseInt(match[1]);
		const unit = match[2];

		const startDate = task.recurringStarting
			? new Date(task.recurringStarting)
			: new Date();

		const endDate = task.recurringEnding && task.recurringEnding !== 'never'
			? new Date(task.recurringEnding)
			: null;

		let currentDate = new Date(startDate);
		currentDate.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Safety counter to prevent infinite loops
		let safetyCounter = 0;
		const MAX_ITERATIONS = 1000;

		// Find the first occurrence from the starting date that matches constraints
		// For weekly/monthly/yearly with constraints, we need to check DAY BY DAY
		// from the starting date until we find a match
		if (unit === 'week' && task.recurringWDay && task.recurringWDay.length > 0) {
			// For weekly with specific days, advance day by day from starting date
			// until we find a matching day of week
			while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && safetyCounter < MAX_ITERATIONS) {
				currentDate.setDate(currentDate.getDate() + 1);
				safetyCounter++;
			}
		} else if (unit === 'month' && task.recurringDay && task.recurringDay.length > 0) {
			// For monthly with specific days, advance day by day from starting date
			// until we find a matching day of month
			while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && safetyCounter < MAX_ITERATIONS) {
				currentDate.setDate(currentDate.getDate() + 1);
				safetyCounter++;
			}
		} else if (unit === 'year' && task.recurringMonth && task.recurringMonth.length > 0) {
			// For yearly with specific dates, advance day by day from starting date
			// until we find a matching month-day
			while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && safetyCounter < MAX_ITERATIONS) {
				currentDate.setDate(currentDate.getDate() + 1);
				safetyCounter++;
			}
		}

		// Now advance to today or later if starting date is in the past
		safetyCounter = 0;
		while (currentDate < today && safetyCounter < MAX_ITERATIONS) {
			// Check if current date matches before advancing
			if (this.matchesRecurrenceConstraints(currentDate, task, unit)) {
				// Good starting point, just advance by interval
				this.advanceDate(currentDate, interval, unit);
			} else {
				// Advance day by day until we find a match
				currentDate.setDate(currentDate.getDate() + 1);
			}
			safetyCounter++;
		}

		// Final check: make sure we're on a valid occurrence
		safetyCounter = 0;
		while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && safetyCounter < MAX_ITERATIONS) {
			currentDate.setDate(currentDate.getDate() + 1);
			safetyCounter++;
		}

		// Generate occurrences with safety counter
		safetyCounter = 0;
		while (occurrences.length < count && safetyCounter < MAX_ITERATIONS) {
			if (endDate && currentDate > endDate) break;

			// Check if this occurrence matches the day constraints
			if (this.matchesRecurrenceConstraints(currentDate, task, unit)) {
				occurrences.push(this.formatDate(currentDate));

				// Advance to next valid occurrence
				this.advanceDate(currentDate, interval, unit);

				// For constrained recurrences, make sure we land on a valid day
				let innerSafety = 0;
				while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && innerSafety < MAX_ITERATIONS) {
					currentDate.setDate(currentDate.getDate() + 1);
					innerSafety++;
				}
			} else {
				// Shouldn't happen, but advance day by day to find next match
				currentDate.setDate(currentDate.getDate() + 1);
			}

			safetyCounter++;
		}

		return occurrences;
	}

	advanceDate(date: Date, interval: number, unit: string) {
		switch (unit) {
			case 'day':
				date.setDate(date.getDate() + interval);
				break;
			case 'week':
				date.setDate(date.getDate() + (interval * 7));
				break;
			case 'month':
				date.setMonth(date.getMonth() + interval);
				break;
			case 'year':
				date.setFullYear(date.getFullYear() + interval);
				break;
		}
	}

	matchesRecurrenceConstraints(date: Date, task: Task, unit: string): boolean {
		if (unit === 'week' && task.recurringWDay && task.recurringWDay.length > 0) {
			const dayOfWeek = date.getDay();
			return task.recurringWDay.includes(dayOfWeek);
		}

		if (unit === 'month' && task.recurringDay && task.recurringDay.length > 0) {
			const dayOfMonth = date.getDate();
			return task.recurringDay.includes(dayOfMonth);
		}

		if (unit === 'year' && task.recurringMonth && task.recurringMonth.length > 0) {
			const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
			return task.recurringMonth.includes(monthDay);
		}

		return true; // No constraints or daily/simple recurring
	}

	// Calculate next occurrence after a specific date (used when completing a task)
	calculateNextOccurrenceAfterDate(task: Task, afterDate: string): string | null {
		if (!task.isRecurring || !task.recurringPattern) return null;

		const match = task.recurringPattern.match(/^(\d+)(day|week|month|year)$/);
		if (!match) return null;

		const interval = parseInt(match[1]);
		const unit = match[2];

		const endDate = task.recurringEnding && task.recurringEnding !== 'never'
			? new Date(task.recurringEnding)
			: null;

		// Start from the current due date
		const currentDate = new Date(afterDate);
		currentDate.setHours(0, 0, 0, 0);

		const MAX_ITERATIONS = 1000;
		let safetyCounter = 0;

		// Special handling for weekly with multiple days
		// Check if there's another day in the same week first
		if (unit === 'week' && task.recurringWDay && task.recurringWDay.length > 1) {
			// Find the next day in the same week that's in the list
			for (let i = 1; i < 7; i++) { // Check next 6 days (rest of the week)
				const testDate = new Date(currentDate);
				testDate.setDate(testDate.getDate() + i);
				const testDayOfWeek = testDate.getDay();

				if (task.recurringWDay.includes(testDayOfWeek)) {
					// Found another day in the same week!
					if (!endDate || testDate <= endDate) {
						return this.formatDate(testDate);
					}
				}
			}
		}

		// For monthly with multiple days, check if there's another day in the same month
		if (unit === 'month' && task.recurringDay && task.recurringDay.length > 1) {
			const currentDayOfMonth = currentDate.getDate();
			const currentMonth = currentDate.getMonth();

			// Find the next day in the same month that's in the list
			for (const day of task.recurringDay.sort((a, b) => a - b)) {
				if (day > currentDayOfMonth) {
					const testDate = new Date(currentDate);
					testDate.setDate(day);

					// Make sure we're still in the same month (handles Feb 30, etc.)
					if (testDate.getMonth() === currentMonth) {
						if (!endDate || testDate <= endDate) {
							return this.formatDate(testDate);
						}
					}
				}
			}
		}

		// For yearly with multiple dates, check if there's another date in the same year
		if (unit === 'year' && task.recurringMonth && task.recurringMonth.length > 1) {
			const currentYear = currentDate.getFullYear();
			const currentMonthDay = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

			// Find the next date in the same year that's in the list
			const sortedDates = task.recurringMonth.sort();
			for (const monthDay of sortedDates) {
				if (monthDay > currentMonthDay) {
					const [month, day] = monthDay.split('-').map(Number);
					const testDate = new Date(currentYear, month - 1, day);
					testDate.setHours(0, 0, 0, 0);

					if (!endDate || testDate <= endDate) {
						return this.formatDate(testDate);
					}
				}
			}
		}

		// No more occurrences in current period, advance by interval
		this.advanceDate(currentDate, interval, unit);

		// Then find the next date that matches constraints
		while (!this.matchesRecurrenceConstraints(currentDate, task, unit) && safetyCounter < MAX_ITERATIONS) {
			currentDate.setDate(currentDate.getDate() + 1);
			safetyCounter++;
		}

		// Check if we exceeded the ending date
		if (endDate && currentDate > endDate) return null;

		if (safetyCounter >= MAX_ITERATIONS) {
			console.error('Safety limit reached in calculateNextOccurrenceAfterDate');
			return null;
		}

		return this.formatDate(currentDate);
	}

	buildRecurringTaskInstance(recurringTask: Task, dueDate: string): string {
		const taskIdentifier = this.plugin.settings.taskIdentifier;
		let projectTag = taskIdentifier;

		if (recurringTask.project) {
			projectTag += '/' + recurringTask.project;
			if (recurringTask.section) {
				projectTag += '/' + recurringTask.section;
			}
		}

		let line = `- [ ] ${recurringTask.taskName}`;

		if (dueDate) {
			line += ` due::${dueDate}`;
		}

		if (recurringTask.eta) {
			line += ` eta::${recurringTask.eta}`;
		}

		line += ` ${projectTag}`;

		return line;
	}

	renderCustomTimelineView(contentEl: HTMLElement) {
		if (!this.selectedTimelineView) return;

		const header = contentEl.createDiv({ cls: 'content-header' });
		header.createEl('h2', { text: this.selectedTimelineView.name });

		// Add sorting dropdown
		this.renderSortDropdown(header);

		// Calculate date range based on view type
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		let startDate = new Date(today);
		let endDate = new Date(today);

		const viewType = this.selectedTimelineView.type;

		switch (viewType) {
			case 'this-week': {
				// Start from today, end at end of current week (Sunday)
				const dayOfWeek = today.getDay();
				const daysUntilSunday = 7 - dayOfWeek;
				endDate.setDate(endDate.getDate() + daysUntilSunday);
				break;
			}

			case 'next-week': {
				// Start from next Monday, end next Sunday
				const currentDay = today.getDay();
				const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
				startDate.setDate(today.getDate() + daysUntilNextMonday);
				endDate.setDate(startDate.getDate() + 6);
				break;
			}

			case 'this-month':
				// Start from today, end at last day of current month
				endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
				endDate.setHours(0, 0, 0, 0);
				break;

			case 'next-month':
				// Start from first day of next month, end at last day of next month
				startDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
				endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
				startDate.setHours(0, 0, 0, 0);
				endDate.setHours(0, 0, 0, 0);
				break;

			case 'all-tasks':
				// Show all tasks with due dates
				startDate = new Date(0); // Beginning of time
				endDate = new Date(9999, 11, 31); // Far future
				break;

			case 'date-range':
			default:
				// Use the days field for custom date range
				endDate.setDate(endDate.getDate() + (this.selectedTimelineView.days || 7));
				break;
		}

		// Filter overdue tasks (before today, hide templates only if occurrence exists)
		const overdueTasks = viewType !== 'all-tasks' ? this.tasks.filter(task => {
			if (task.status === 'done') return false;
			if (!task.dueDate) return false;

			// For recurring templates: only hide if there's a materialized occurrence
			if (task.isRecurring && !task.isGeneratedRecurring) {
				const hasMaterialized = this.tasks.some(t =>
					!t.isRecurring &&
					t.taskName === task.taskName &&
					t.dueDate === task.dueDate
				);
				if (hasMaterialized) return false;
			}

			return this.isOverdue(task.dueDate);
		}) : [];

		// Filter tasks in date range
		const timelineTasks = this.tasks.filter(task => {
			if (task.status === 'done') return false;

			// For all-tasks view, include tasks without due dates
			if (viewType === 'all-tasks') {
				// For recurring templates: only hide if there's a materialized occurrence
				if (task.isRecurring && !task.isGeneratedRecurring) {
					const hasMaterialized = this.tasks.some(t =>
						!t.isRecurring &&
						t.taskName === task.taskName &&
						t.dueDate === task.dueDate
					);
					if (hasMaterialized) return false;
				}
				return true; // Include all non-done tasks
			}

			if (!task.dueDate) return false;

			// For recurring templates: only hide if there's a materialized occurrence
			if (task.isRecurring && !task.isGeneratedRecurring) {
				const hasMaterialized = this.tasks.some(t =>
					!t.isRecurring &&
					t.taskName === task.taskName &&
					t.dueDate === task.dueDate
				);
				if (hasMaterialized) return false;
			}

			const taskDate = new Date(task.dueDate);
			return taskDate >= startDate && taskDate <= endDate;
		});

		// Sort tasks using selected sort option
		const sortedOverdueTasks = this.sortTasks(overdueTasks);
		const sortedTimelineTasks = this.sortTasks(timelineTasks);

		// Calculate total ETA (including overdue)
		const allTasks = [...sortedOverdueTasks, ...sortedTimelineTasks];
		const totalEta = this.calculateTotalEta(allTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks grouped by date
		const taskList = contentEl.createDiv({ cls: 'task-list' });

		// Render overdue section if there are overdue tasks
		if (sortedOverdueTasks.length > 0) {
			const overdueHeader = taskList.createDiv({ cls: 'date-group-header overdue-header' });
			overdueHeader.setText(`⚠️ Overdue (${sortedOverdueTasks.length})`);

			sortedOverdueTasks.forEach(task => {
				this.renderTask(taskList, task);
			});
		}

		// Render upcoming tasks grouped by date
		let currentDate = '';
		sortedTimelineTasks.forEach(task => {
			if (task.dueDate && task.dueDate !== currentDate) {
				currentDate = task.dueDate;
				const dateHeader = taskList.createDiv({ cls: 'date-group-header' });
				dateHeader.setText(this.formatDateHeader(new Date(currentDate)));
			}
			this.renderTask(taskList, task);
		});

		if (allTasks.length === 0) {
			taskList.createDiv({ text: 'No tasks in this timeline', cls: 'empty-state' });
		}
	}

	formatDateHeader(date: Date): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const checkDate = new Date(date);
		checkDate.setHours(0, 0, 0, 0);

		if (checkDate.getTime() === today.getTime()) {
			return 'Today - ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
		} else if (checkDate.getTime() === tomorrow.getTime()) {
			return 'Tomorrow - ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
		} else {
			return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
		}
	}

	showNewTaskModal() {
		const modal = new NewTaskModal(this.app, this, async (taskData: {
			name: string;
			dueDate: string | null;
			eta: string | null;
			project: string | null;
			section: string | null;
			priority: string | null;
			isRecurring: boolean;
			recurringPattern: string | null;
			recurringStarting: string | null;
			recurringEnding: string | null;
			recurringWDay: number[] | null;
			recurringDay: number[] | null;
			recurringMonth: string[] | null;
		}) => {
			await this.createNewTaskFromModal(taskData);
		});
		modal.open();
	}

	async createNewTaskFromModal(taskData: {
		name: string;
		dueDate: string | null;
		eta: string | null;
		project: string | null;
		section: string | null;
		priority: string | null;
		isRecurring: boolean;
		recurringPattern: string | null;
		recurringStarting: string | null;
		recurringEnding: string | null;
		recurringWDay: number[] | null;
		recurringDay: number[] | null;
		recurringMonth: string[] | null;
	}) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const taskIdentifier = this.plugin.settings.taskIdentifier;
		let projectTag = taskIdentifier;
		if (taskData.project) {
			projectTag += '/' + taskData.project;
			if (taskData.section) {
				projectTag += '/' + taskData.section;
			}
		}

		// Build the new task line
		let newTaskLine = `- [ ] ${taskData.name}`;

		// If recurring, calculate first occurrence due date
		let calculatedDueDate = taskData.dueDate;
		if (taskData.isRecurring && taskData.recurringPattern) {
			// Create a temporary task object to calculate next occurrence
			const tempTask: Task = {
				taskName: taskData.name,
				status: 'todo',
				lineNumber: 0,
				isRecurring: true,
				isGeneratedRecurring: false,
				recurringPattern: taskData.recurringPattern,
				recurringStarting: taskData.recurringStarting || this.formatDate(new Date()),
				recurringEnding: taskData.recurringEnding || null,
				recurringWDay: taskData.recurringWDay || null,
				recurringDay: taskData.recurringDay || null,
				recurringMonth: taskData.recurringMonth || null,
				dueDate: null,
				eta: null,
				project: taskData.project,
				section: taskData.section,
				tags: [],
				rawLine: '',
				priority: null
			};

			const firstOccurrence = this.calculateNextOccurrences(tempTask, 1)[0];
			if (firstOccurrence) {
				calculatedDueDate = firstOccurrence;
			}
		}

		// For recurring tasks, don't add due:: to the template - only to the occurrence
		if (!taskData.isRecurring && calculatedDueDate) {
			newTaskLine += ` due::${calculatedDueDate}`;
		}
		if (taskData.eta) {
			newTaskLine += ` eta::${taskData.eta}`;
		}
		if (taskData.priority) {
			newTaskLine += ` priority::${taskData.priority}`;
		}
		newTaskLine += ` ${projectTag}`;

		// Add recurring fields if this is a recurring task
		if (taskData.isRecurring && taskData.recurringPattern) {
			newTaskLine += ` recurring::${taskData.recurringPattern}`;
			if (taskData.recurringStarting) {
				newTaskLine += ` starting::${taskData.recurringStarting}`;
			}
			if (taskData.recurringEnding) {
				newTaskLine += ` ending::${taskData.recurringEnding}`;
			}
			if (taskData.recurringWDay && taskData.recurringWDay.length > 0) {
				const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
				const wdayNames = taskData.recurringWDay.map(i => weekdays[i]);
				newTaskLine += ` wday::[${wdayNames.join(',')}]`;
			}
			if (taskData.recurringDay && taskData.recurringDay.length > 0) {
				newTaskLine += ` day::[${taskData.recurringDay.join(',') }]`;
			}
			if (taskData.recurringMonth && taskData.recurringMonth.length > 0) {
				newTaskLine += ` month::[${taskData.recurringMonth.join(',')}]`;
			}
		}

		// Find first non-header line or insert at beginning
		let insertIndex = 0;
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].startsWith('#') && lines[i].trim() !== '') {
				insertIndex = i;
				break;
			}
		}

		lines.splice(insertIndex, 0, newTaskLine);

		// If recurring, also create first occurrence instance
		if (taskData.isRecurring && calculatedDueDate) {
			const occurrenceLine = `- [ ] ${taskData.name} due::${calculatedDueDate}${taskData.eta ? ` eta::${taskData.eta}` : ''} ${projectTag}`;
			lines.splice(insertIndex + 1, 0, occurrenceLine);
		}

		await this.app.vault.modify(file, lines.join('\n'));

		new Notice(taskData.isRecurring ? 'Recurring task created!' : 'Task created!');
		await this.loadTasks();
		this.renderView();
	}

	showAddTimelineDialog() {
		// Create a simple modal for adding timeline view
		const modal = new TimelineViewModal(this.app, (name: string, days: number) => {
			const id = `custom-${Date.now()}`;
			this.customTimelineViews.push({
				id,
				name,
				type: 'date-range',
				days
			});
			this.renderView();
		});
		modal.open();
	}

	deleteTimelineView(index: number) {
		const view = this.customTimelineViews[index];
		if (view.isPreset) {
			new Notice('Cannot delete preset views');
			return;
		}

		// Confirm deletion
		new ConfirmModal(
			this.app,
			`Delete timeline view "${view.name}"?`,
			() => {
				// Remove from array
				this.customTimelineViews.splice(index, 1);

				// If deleted view was selected, switch to today
				if (this.selectedTimelineView?.id === view.id) {
					this.currentView = 'today';
					this.selectedTimelineView = null;
				}

				this.renderView();
				new Notice(`Deleted timeline view "${view.name}"`);
			}
		).open();
	}

	showEditTimelineDialog(view: CustomTimelineView, index: number) {
		if (view.isPreset) {
			new Notice('Cannot edit preset views');
			return;
		}

		const modal = new TimelineViewModal(this.app, (name: string, days: number) => {
			// Update the view
			this.customTimelineViews[index] = {
				id: view.id, // Keep same ID
				name: name,
				type: 'date-range',
				days: days,
				isPreset: false
			};

			// If this view is currently selected, update the reference
			if (this.selectedTimelineView?.id === view.id) {
				this.selectedTimelineView = this.customTimelineViews[index];
			}

			this.renderView();
			new Notice(`Updated timeline view "${name}"`);
		}, view.name, view.days || 7); // Pass existing values for editing
		modal.open();
	}

	showRecurringEditor(task: Task) {
		const modal = new RecurringTaskModal(this.app, task, async (updatedTask: Task) => {
			// If converting to recurring or editing recurring settings
			if (updatedTask.isRecurring) {
				// Set starting date if not provided
				if (!updatedTask.recurringStarting) {
					updatedTask.recurringStarting = this.formatDate(new Date());
				}

				// Calculate first occurrence based on recurring settings
				const firstOccurrence = this.calculateNextOccurrences(updatedTask, 1)[0];
				if (firstOccurrence) {
					// Update the template's due date to match first occurrence
					updatedTask.dueDate = firstOccurrence;
				}
			}

			// Save the updated task
			await this.updateTask(updatedTask);

			// If this is a recurring task, create its first occurrence (if not already exists)
			if (updatedTask.isRecurring && !updatedTask.isGeneratedRecurring) {
				await this.createFirstOccurrence(updatedTask);
			}

			// Reload tasks to get updated state
			await this.loadTasks();
			this.renderView();
		});
		modal.open();
	}

	async createFirstOccurrence(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);
		if (!file || !(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Get the first occurrence date
		const occurrences = this.calculateNextOccurrences(task, 1);
		if (occurrences.length === 0) return;

		const firstOccurrence = occurrences[0];
		const newTaskLine = this.buildRecurringTaskInstance(task, firstOccurrence);

		// Insert after the recurring task template
		let insertIndex = task.lineNumber + 1;
		lines.splice(insertIndex, 0, newTaskLine);

		await this.app.vault.modify(file, lines.join('\n'));
		new Notice(`First occurrence created for ${firstOccurrence}`);
	}
}

// Modal for creating/editing custom timeline views
class TimelineViewModal extends Modal {
	onSubmit: (name: string, days: number) => void;
	nameInput: HTMLInputElement;
	daysInput: HTMLInputElement;
	existingName: string | null;
	existingDays: number | null;

	constructor(app: App, onSubmit: (name: string, days: number) => void, existingName?: string, existingDays?: number) {
		super(app);
		this.onSubmit = onSubmit;
		this.existingName = existingName || null;
		this.existingDays = existingDays || null;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const isEditing = this.existingName !== null;
		contentEl.createEl('h2', { text: isEditing ? 'Edit Timeline View' : 'Create Custom Timeline View' });

		// Name input
		const nameContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		nameContainer.createEl('label', { text: 'View Name:' });
		this.nameInput = nameContainer.createEl('input', {
			type: 'text',
			placeholder: 'e.g., Next 14 Days'
		});
		if (this.existingName) {
			this.nameInput.value = this.existingName;
		}

		// Days input
		const daysContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		daysContainer.createEl('label', { text: 'Number of Days:' });
		this.daysInput = daysContainer.createEl('input', {
			type: 'number',
			placeholder: 'e.g., 14'
		});
		this.daysInput.value = this.existingDays !== null ? this.existingDays.toString() : '7';

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const submitBtn = buttonContainer.createEl('button', {
			text: isEditing ? 'Update' : 'Create',
			cls: 'mod-cta'
		});
		submitBtn.addEventListener('click', () => {
			const name = this.nameInput.value.trim();
			const days = parseInt(this.daysInput.value);

			if (name && days > 0) {
				this.onSubmit(name, days);
				this.close();
			} else {
				new Notice('Please enter a valid name and number of days');
			}
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for editing recurring tasks
class RecurringTaskModal extends Modal {
	task: Task;
	onSubmit: (task: Task) => void;

	// Input elements
	recurringTypeSelect: HTMLSelectElement;
	intervalInput: HTMLInputElement;
	startingInput: HTMLInputElement;
	endingInput: HTMLInputElement;
	wdayContainer: HTMLElement;
	dayContainer: HTMLElement;
	monthContainer: HTMLElement;
	wdayCheckboxes: { [key: string]: HTMLInputElement } = {};
	dayInput: HTMLInputElement;
	monthInput: HTMLInputElement;

	constructor(app: App, task: Task, onSubmit: (task: Task) => void) {
		super(app);
		this.task = task;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Edit Recurring Task' });

		// Recurring pattern type (day/week/month/year)
		const typeContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		typeContainer.createEl('label', { text: 'Recurrence Type:' });
		this.recurringTypeSelect = typeContainer.createEl('select');

		const options = [
			{ value: '', text: 'None (One-time task)' },
			{ value: 'day', text: 'Daily' },
			{ value: 'week', text: 'Weekly' },
			{ value: 'month', text: 'Monthly' },
			{ value: 'year', text: 'Yearly' }
		];

		options.forEach(opt => {
			const option = this.recurringTypeSelect.createEl('option', {
				value: opt.value,
				text: opt.text
			});
		});

		// Set current value
		if (this.task.isRecurring && this.task.recurringPattern) {
			const match = this.task.recurringPattern.match(/(\d+)(day|week|month|year)/);
			if (match) {
				this.recurringTypeSelect.value = match[2];
			}
		}

		// Interval
		const intervalContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		intervalContainer.createEl('label', { text: 'Every N (interval):' });
		this.intervalInput = intervalContainer.createEl('input', {
			type: 'number',
			placeholder: '1'
		});
		this.intervalInput.value = '1';
		if (this.task.recurringPattern) {
			const match = this.task.recurringPattern.match(/(\d+)/);
			if (match) {
				this.intervalInput.value = match[1];
			}
		}

		// Starting date (with date picker)
		const startingContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		startingContainer.createEl('label', { text: 'Starting Date:' });
		this.startingInput = startingContainer.createEl('input', {
			type: 'date'
		});
		if (this.task.recurringStarting) {
			this.startingInput.value = this.task.recurringStarting;
		} else {
			this.startingInput.value = new Date().toISOString().split('T')[0];
		}

		// Ending date (with date picker)
		const endingContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		endingContainer.createEl('label', { text: 'Ending Date (optional):' });
		this.endingInput = endingContainer.createEl('input', {
			type: 'date'
		});
		if (this.task.recurringEnding && this.task.recurringEnding !== 'never') {
			this.endingInput.value = this.task.recurringEnding;
		}

		// Weekly: days of week
		this.wdayContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-wday' });
		this.wdayContainer.createEl('label', { text: 'Weekly: Days of week' });
		const wdayGrid = this.wdayContainer.createDiv({ cls: 'checkbox-grid' });
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		dayNames.forEach((day, index) => {
			const checkboxContainer = wdayGrid.createDiv({ cls: 'checkbox-item' });
			const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
			checkbox.id = `wday-${index}`;
			this.wdayCheckboxes[index] = checkbox;
			checkboxContainer.createEl('label', { text: day, attr: { for: `wday-${index}` } });

			// Set current values
			if (this.task.recurringWDay && this.task.recurringWDay.includes(index)) {
				checkbox.checked = true;
			}
		});
		this.wdayContainer.style.display = this.recurringTypeSelect.value === 'week' ? 'block' : 'none';

		// Monthly: days of month
		this.dayContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-day' });
		this.dayContainer.createEl('label', { text: 'Monthly: Days of month (comma-separated, e.g., 1,15,30):' });
		this.dayInput = this.dayContainer.createEl('input', {
			type: 'text',
			placeholder: '1,15'
		});
		if (this.task.recurringDay && this.task.recurringDay.length > 0) {
			this.dayInput.value = this.task.recurringDay.join(',');
		}
		this.dayContainer.style.display = this.recurringTypeSelect.value === 'month' ? 'block' : 'none';

		// Yearly: specific dates
		this.monthContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-month' });
		this.monthContainer.createEl('label', { text: 'Yearly: Dates (MM-DD format, comma-separated, e.g., 12-01,06-15):' });
		this.monthInput = this.monthContainer.createEl('input', {
			type: 'text',
			placeholder: '12-01,06-15'
		});
		if (this.task.recurringMonth && this.task.recurringMonth.length > 0) {
			this.monthInput.value = this.task.recurringMonth.join(',');
		}
		this.monthContainer.style.display = this.recurringTypeSelect.value === 'year' ? 'block' : 'none';

		// Update visibility when type changes
		this.recurringTypeSelect.addEventListener('change', () => {
			const type = this.recurringTypeSelect.value;
			this.wdayContainer.style.display = type === 'week' ? 'block' : 'none';
			this.dayContainer.style.display = type === 'month' ? 'block' : 'none';
			this.monthContainer.style.display = type === 'year' ? 'block' : 'none';
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const submitBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
		submitBtn.addEventListener('click', () => {
			this.saveRecurring();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	saveRecurring() {
		const type = this.recurringTypeSelect.value;

		if (type === '') {
			// Remove recurring
			this.task.isRecurring = false;
			this.task.recurringPattern = null;
			this.task.recurringStarting = null;
			this.task.recurringEnding = null;
			this.task.recurringWDay = null;
			this.task.recurringDay = null;
			this.task.recurringMonth = null;
		} else {
			const interval = parseInt(this.intervalInput.value) || 1;
			this.task.isRecurring = true;
			this.task.recurringPattern = `${interval}${type}`;
			this.task.recurringStarting = this.startingInput.value.trim() || null;
			this.task.recurringEnding = this.endingInput.value.trim() || null;

			// Clear all constraint fields first
			this.task.recurringWDay = null;
			this.task.recurringDay = null;
			this.task.recurringMonth = null;

			// Set type-specific constraints
			if (type === 'week') {
				const selectedDays = Object.keys(this.wdayCheckboxes)
					.map(k => parseInt(k))
					.filter(k => this.wdayCheckboxes[k].checked);
				this.task.recurringWDay = selectedDays.length > 0 ? selectedDays : null;
			} else if (type === 'month') {
				const days = this.dayInput.value.split(',')
					.map(d => parseInt(d.trim()))
					.filter(d => !isNaN(d) && d >= 1 && d <= 31);
				this.task.recurringDay = days.length > 0 ? days : null;
			} else if (type === 'year') {
				const months = this.monthInput.value.split(',')
					.map(m => m.trim())
					.filter(m => /^\d{2}-\d{2}$/.test(m));
				this.task.recurringMonth = months.length > 0 ? months : null;
			}
		}

		this.onSubmit(this.task);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for creating new tasks
class NewTaskModal extends Modal {
	view: TaskManagerView;
	onSubmit: (taskData: NewTaskData) => void;

	nameInput: HTMLInputElement;
	dueDateInput: HTMLInputElement;
	etaInput: HTMLInputElement;
	projectInput: HTMLInputElement;
	prioritySelect: HTMLSelectElement;

	// Recurring fields
	recurringTypeSelect: HTMLSelectElement;
	intervalInput: HTMLInputElement;
	startingInput: HTMLInputElement;
	endingInput: HTMLInputElement;
	wdayContainer: HTMLElement;
	dayContainer: HTMLElement;
	monthContainer: HTMLElement;
	wdayCheckboxes: { [key: string]: HTMLInputElement } = {};
	dayInput: HTMLInputElement;
	monthInput: HTMLInputElement;

	constructor(app: App, view: TaskManagerView, onSubmit: (taskData: NewTaskData) => void) {
		super(app);
		this.view = view;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Create New Task' });

		// Task name
		const nameContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		nameContainer.createEl('label', { text: 'Task Name:' });
		this.nameInput = nameContainer.createEl('input', {
			type: 'text',
			placeholder: 'Enter task name...'
		});
		this.nameInput.focus();

		// Due date (with date picker)
		const dueDateContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		dueDateContainer.createEl('label', { text: 'Due Date:' });
		this.dueDateInput = dueDateContainer.createEl('input', {
			type: 'date'
		});

		// Pre-fill based on current view
		if (this.view.currentView === 'today' || this.view.currentView === 'custom-timeline') {
			const today = new Date();
			this.dueDateInput.value = this.view.formatDate(today);
		}

		// ETA
		const etaContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		etaContainer.createEl('label', { text: 'Estimated Time (H:MM):' });
		this.etaInput = etaContainer.createEl('input', {
			type: 'text',
			placeholder: '1:00'
		});
		this.etaInput.value = '1:00';

		// Project/Section
		const projectContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		projectContainer.createEl('label', { text: 'Project/Section:' });
		this.projectInput = projectContainer.createEl('input', {
			type: 'text',
			placeholder: 'project/section (optional)'
		});

		// Pre-fill project if in project view
		if (this.view.selectedProject) {
			let projectPath = this.view.selectedProject;
			if (this.view.selectedSection) {
				projectPath += '/' + this.view.selectedSection;
			}
			this.projectInput.value = projectPath;
		}

		// Priority
		const priorityContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		priorityContainer.createEl('label', { text: 'Priority:' });
		this.prioritySelect = priorityContainer.createEl('select');

		// Add "No priority" option
		this.prioritySelect.createEl('option', { text: 'No priority', value: '' });

		// Add all configured priority labels
		this.view.plugin.settings.priorityLabels.forEach(label => {
			const option = this.prioritySelect.createEl('option', { text: label.name, value: label.id });
			// Set style to show the color
			option.style.backgroundColor = label.color;
			option.style.color = '#fff';
		});

		// Recurring configuration section
		const recurringHeader = contentEl.createEl('h3', { text: 'Recurring Settings (Optional)' });
		recurringHeader.style.marginTop = '20px';

		// Recurrence type
		const typeContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		typeContainer.createEl('label', { text: 'Recurrence Type:' });
		this.recurringTypeSelect = typeContainer.createEl('select');
		['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'].forEach(type => {
			this.recurringTypeSelect.createEl('option', { text: type, value: type.toLowerCase() });
		});

		// Interval
		const intervalContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-interval' });
		intervalContainer.createEl('label', { text: 'Every N (interval):' });
		this.intervalInput = intervalContainer.createEl('input', {
			type: 'number',
			placeholder: '1'
		});
		this.intervalInput.value = '1';

		// Starting date (with date picker)
		const startingContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-starting' });
		startingContainer.createEl('label', { text: 'Starting Date:' });
		this.startingInput = startingContainer.createEl('input', {
			type: 'date'
		});
		this.startingInput.value = this.view.formatDate(new Date());

		// Ending date (with date picker)
		const endingContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-ending' });
		endingContainer.createEl('label', { text: 'Ending Date (optional):' });
		this.endingInput = endingContainer.createEl('input', {
			type: 'date'
		});

		// Weekly: Days of week
		this.wdayContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-wday' });
		this.wdayContainer.createEl('label', { text: 'Weekly: Days of week' });
		const wdayGrid = this.wdayContainer.createDiv({ cls: 'checkbox-grid' });
		const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		weekdays.forEach((day, index) => {
			const checkboxItem = wdayGrid.createDiv({ cls: 'checkbox-item' });
			const checkbox = checkboxItem.createEl('input', { type: 'checkbox' });
			checkbox.id = `wday-${day}`;
			checkboxItem.createEl('label', { text: day.charAt(0).toUpperCase() + day.slice(1), attr: { for: `wday-${day}` } });
			this.wdayCheckboxes[day] = checkbox;
		});

		// Monthly: Days of month
		this.dayContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-day' });
		this.dayContainer.createEl('label', { text: 'Monthly: Days of month (comma-separated):' });
		this.dayInput = this.dayContainer.createEl('input', {
			type: 'text',
			placeholder: 'e.g., 1,15,30'
		});

		// Yearly: Dates
		this.monthContainer = contentEl.createDiv({ cls: 'modal-input-container recurring-month' });
		this.monthContainer.createEl('label', { text: 'Yearly: Dates (MM-DD, comma-separated):' });
		this.monthInput = this.monthContainer.createEl('input', {
			type: 'text',
			placeholder: 'e.g., 01-01,12-25'
		});

		// Show/hide relevant fields based on type
		const updateVisibility = () => {
			const type = this.recurringTypeSelect.value;
			const isRecurring = type !== 'none';

			intervalContainer.style.display = isRecurring ? '' : 'none';
			startingContainer.style.display = isRecurring ? '' : 'none';
			endingContainer.style.display = isRecurring ? '' : 'none';

			this.wdayContainer.style.display = (type === 'weekly') ? '' : 'none';
			this.dayContainer.style.display = (type === 'monthly') ? '' : 'none';
			this.monthContainer.style.display = (type === 'yearly') ? '' : 'none';
		};

		this.recurringTypeSelect.addEventListener('change', updateVisibility);
		updateVisibility(); // Initial state

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const submitBtn = buttonContainer.createEl('button', { text: 'Create Task', cls: 'mod-cta' });
		submitBtn.addEventListener('click', () => {
			this.submitTask();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		// Enter key to submit
		this.nameInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submitTask();
			}
		});
	}

	submitTask() {
		const name = this.nameInput.value.trim();
		if (!name) {
			new Notice('Task name is required');
			return;
		}

		const dueDate = this.dueDateInput.value.trim() || null;
		const eta = this.etaInput.value.trim() || null;
		const projectPath = this.projectInput.value.trim();

		let project: string | null = null;
		let section: string | null = null;

		if (projectPath) {
			const parts = projectPath.split('/');
			project = parts[0] || null;
			section = parts[1] || null;
		}

		// Extract recurring configuration
		const recurringType = this.recurringTypeSelect.value;
		const isRecurring = recurringType !== 'none';

		let recurringPattern: string | null = null;
		let recurringStarting: string | null = null;
		let recurringEnding: string | null = null;
		let recurringWDay: number[] | null = null;
		let recurringDay: number[] | null = null;
		let recurringMonth: string[] | null = null;

		if (isRecurring) {
			const interval = this.intervalInput.value.trim() || '1';
			// Use full word instead of just first character
			let unit = '';
			if (recurringType === 'daily') unit = 'day';
			else if (recurringType === 'weekly') unit = 'week';
			else if (recurringType === 'monthly') unit = 'month';
			else if (recurringType === 'yearly') unit = 'year';
			recurringPattern = `${interval}${unit}`;

			recurringStarting = this.startingInput.value.trim() || null;
			recurringEnding = this.endingInput.value.trim() || null;

			// Weekly: Extract selected days
			if (recurringType === 'weekly') {
				recurringWDay = [];
				const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
				weekdays.forEach((day, index) => {
					if (this.wdayCheckboxes[day].checked) {
						recurringWDay!.push(index);
					}
				});
				if (recurringWDay.length === 0) recurringWDay = null;
			}

			// Monthly: Parse days of month
			if (recurringType === 'monthly') {
				const dayStr = this.dayInput.value.trim();
				if (dayStr) {
					recurringDay = dayStr.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
					if (recurringDay.length === 0) recurringDay = null;
				}
			}

			// Yearly: Parse dates
			if (recurringType === 'yearly') {
				const monthStr = this.monthInput.value.trim();
				if (monthStr) {
					recurringMonth = monthStr.split(',').map(m => m.trim()).filter(m => m.length > 0);
					if (recurringMonth.length === 0) recurringMonth = null;
				}
			}
		}

		const priority = this.prioritySelect.value || null;

		this.onSubmit({
			name,
			dueDate,
			eta,
			project,
			section,
			priority,
			isRecurring,
			recurringPattern,
			recurringStarting,
			recurringEnding,
			recurringWDay,
			recurringDay,
			recurringMonth
		});
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Confirm Modal for confirmation dialogs
class ConfirmModal extends Modal {
	message: string;
	onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const confirmBtn = buttonContainer.createEl('button', {
			text: 'Confirm',
			cls: 'mod-cta'
		});
		confirmBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Settings Tab
class TaskManagerSettingTab extends PluginSettingTab {
	plugin: TaskManagerPlugin;

	constructor(app: App, plugin: TaskManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Task Manager')
			.setHeading();

		new Setting(containerEl)
			.setName('Task File')
			.setDesc('Path to the markdown file containing your tasks (e.g., tasks.md)')
			.addText(text => text
				.setPlaceholder('tasks.md')
				.setValue(this.plugin.settings.taskFile)
				.onChange(async (value) => {
					this.plugin.settings.taskFile = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Task Identifier')
			.setDesc('Tag used to identify tasks (e.g., #tlog). Tasks can have nested structure like #tlog/project/section')
			.addText(text => text
				.setPlaceholder('#tlog')
				.setValue(this.plugin.settings.taskIdentifier)
				.onChange(async (value) => {
					this.plugin.settings.taskIdentifier = value;
					await this.plugin.saveSettings();
				}));

		// Priority Labels Section
		new Setting(containerEl)
			.setName('Priority Labels')
			.setDesc('Manage custom priority labels for your tasks.')
			.setHeading();

		// Container for priority labels
		const priorityContainer = containerEl.createDiv({ cls: 'priority-labels-container' });
		this.renderPriorityLabels(priorityContainer);

		// Add new label button
		new Setting(containerEl)
			.setName('Add New Priority Label')
			.addButton(button => button
				.setButtonText('Add Label')
				.onClick(async () => {
					const newLabel: PriorityLabel = {
						id: `priority-${Date.now()}`,
						name: 'New Priority',
						color: '#888888',
						order: this.plugin.settings.priorityLabels.length + 1
					};
					this.plugin.settings.priorityLabels.push(newLabel);
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				}));

		new Setting(containerEl)
			.setName('Task Format')
			.setDesc('Tasks should follow this format:')
			.setHeading();

		containerEl.createEl('pre', {
			text: '- [ ] Task name due::2024-01-15 eta::1:30 priority::high #tlog/project/section',
			cls: 'task-format-example'
		});

		const formatList = containerEl.createEl('ul');

		const checkboxItem = formatList.createEl('li');
		checkboxItem.createEl('strong', { text: 'Checkbox:' });
		checkboxItem.appendText(' - [ ] for todo, - [x] for done');

		const dueDateItem = formatList.createEl('li');
		dueDateItem.createEl('strong', { text: 'Due date:' });
		dueDateItem.appendText(' due::YYYY-MM-DD');

		const etaItem = formatList.createEl('li');
		etaItem.createEl('strong', { text: 'Estimated time:' });
		etaItem.appendText(' eta::HH:MM');

		const priorityItem = formatList.createEl('li');
		priorityItem.createEl('strong', { text: 'Priority:' });
		priorityItem.appendText(' priority::label-id');

		const projectItem = formatList.createEl('li');
		projectItem.createEl('strong', { text: 'Project structure:' });
		projectItem.appendText(` ${this.plugin.settings.taskIdentifier}/project/section`);
	}

	renderPriorityLabels(container: HTMLElement) {
		container.empty();

		this.plugin.settings.priorityLabels.forEach((label, index) => {
			const labelSetting = new Setting(container)
				.setClass('priority-label-setting');

			// Name input
			labelSetting.addText(text => text
				.setPlaceholder('Label name')
				.setValue(label.name)
				.onChange(async (value) => {
					label.name = value;
					await this.plugin.saveSettings();
				}));

			// Color input (text for hex)
			labelSetting.addText(text => {
				text
					.setPlaceholder('#RRGGBB')
					.setValue(label.color)
					.onChange(async (value) => {
						// Validate hex color
						if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
							label.color = value;
							await this.plugin.saveSettings();
							// Update color preview
							if (colorPreview) {
								colorPreview.style.backgroundColor = value;
							}
						}
					});
				text.inputEl.style.width = '100px';

				// Add color preview
				const colorPreview = text.inputEl.parentElement?.createDiv({ cls: 'color-preview' });
				if (colorPreview) {
					colorPreview.style.backgroundColor = label.color;
					colorPreview.style.width = '30px';
					colorPreview.style.height = '30px';
					colorPreview.style.border = '1px solid var(--background-modifier-border)';
					colorPreview.style.borderRadius = '4px';
					colorPreview.style.display = 'inline-block';
					colorPreview.style.marginLeft = '8px';
					colorPreview.style.verticalAlign = 'middle';
					colorPreview.style.cursor = 'pointer';

					// Make color preview clickable to open color picker
					colorPreview.addEventListener('click', () => {
						const colorInput = document.createElement('input');
						colorInput.type = 'color';
						colorInput.value = label.color;
						colorInput.addEventListener('change', async () => {
							label.color = colorInput.value;
							await this.plugin.saveSettings();
							colorPreview.style.backgroundColor = colorInput.value;
							text.setValue(colorInput.value);
						});
						colorInput.click();
					});
				}
			});

			// Order input
			labelSetting.addText(text => {
				text
					.setPlaceholder('Order')
					.setValue(label.order.toString())
					.onChange(async (value) => {
						const order = parseInt(value);
						if (!isNaN(order)) {
							label.order = order;
							await this.plugin.saveSettings();
						}
					});
				text.inputEl.style.width = '60px';
			});

			// Label ID display
			labelSetting.setDesc(`ID: ${label.id} (use in tasks as priority::${label.id})`);

			// Delete button
			labelSetting.addButton(button => button
				.setButtonText('Delete')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.priorityLabels.splice(index, 1);
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				}));
		});
	}
}
