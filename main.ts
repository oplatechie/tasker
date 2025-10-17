import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	ItemView,
	WorkspaceLeaf,
	TFile,
	Notice,
	Modal
} from 'obsidian';

// Plugin Settings Interface
interface TaskManagerSettings {
	taskFile: string;
	taskIdentifier: string;
}

const DEFAULT_SETTINGS: TaskManagerSettings = {
	taskFile: 'tasks.md',
	taskIdentifier: '#tlog'
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
}

// Custom Timeline View Interface
interface CustomTimelineView {
	id: string;
	name: string;
	type: 'date-range';
	days: number; // Number of days from today
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
			this.activateView();
		});

		// Add command to open task manager
		this.addCommand({
			id: 'open-task-manager',
			name: 'Open Task Manager',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to create new task
		this.addCommand({
			id: 'create-new-task',
			name: 'Create New Task',
			callback: async () => {
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_MANAGER);
				if (leaves.length > 0) {
					const view = leaves[0].view as TaskManagerView;
					await view.createNewTask();
				} else {
					new Notice('Please open Task Manager first');
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
		// Cleanup
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASK_MANAGER);
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
	fileWatcherRef: any = null;
	collapsedProjects: Set<string> = new Set();
	isMobile: boolean = false;
	customTimelineViews: CustomTimelineView[] = [
		{ id: 'next-7-days', name: 'Next 7 Days', type: 'date-range', days: 7 },
		{ id: 'next-week', name: 'Next Week', type: 'date-range', days: 7 },
		{ id: 'this-month', name: 'This Month', type: 'date-range', days: 30 }
	];
	selectedTimelineView: CustomTimelineView | null = null;
	lastRecurringCheck: number = 0;

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
		this.renderView();
	}

	async onClose() {
		// Cleanup file watcher
		if (this.fileWatcherRef) {
			this.app.vault.offref(this.fileWatcherRef);
		}
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
		const wdayMatch = line.match(/wday::\[([^\]]+)\]/);
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
		const dayMatch = line.match(/day::\[([^\]]+)\]/);
		let recurringDay: number[] | null = null;
		if (dayMatch) {
			recurringDay = dayMatch[1].split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
		}

		// Extract month (for yearly recurring)
		const monthMatch = line.match(/month::\[([^\]]+)\]/);
		let recurringMonth: string[] | null = null;
		if (monthMatch) {
			recurringMonth = monthMatch[1].split(',').map(m => m.trim());
		}

		// Extract tags and determine project/section
		const tagRegex = /#[\w\/]+/g;
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
			.replace(/recurring::\S+/g, '')
			.replace(/starting::\S+/g, '')
			.replace(/ending::\S+/g, '')
			.replace(/wday::\[([^\]]+)\]/g, '')
			.replace(/day::\[([^\]]+)\]/g, '')
			.replace(/month::\[([^\]]+)\]/g, '')
			.replace(/#[\w\/]+/g, '')
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
			recurringMonth
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
		if (this.selectedProject !== null || this.currentView === 'today' || this.currentView === 'done') {
			// Show task list with back button
			this.renderMobileTaskList(container);
		} else {
			// Show navigation cards
			this.renderMobileNavigation(container);
		}
	}

	renderMobileNavigation(container: HTMLElement) {
		const navContainer = container.createDiv({ cls: 'mobile-nav-container' });

		// New Task button
		const newTaskCard = navContainer.createDiv({ cls: 'mobile-nav-card new-task-card' });
		newTaskCard.createSpan({ text: '+ New Task', cls: 'mobile-nav-card-title' });
		newTaskCard.addEventListener('click', async () => {
			await this.createNewTask();
			await this.loadTasks();
			this.renderView();
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
		this.customTimelineViews.forEach(view => {
			const viewItem = navEl.createDiv({
				cls: this.selectedTimelineView?.id === view.id ? 'nav-item active' : 'nav-item'
			});
			viewItem.setText(`📆 ${view.name}`);
			viewItem.addEventListener('click', () => {
				this.currentView = 'custom-timeline';
				this.selectedProject = null;
				this.selectedSection = null;
				this.selectedTimelineView = view;
				this.renderView();
			});
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

	renderTodayView(contentEl: HTMLElement) {
		const header = contentEl.createDiv({ cls: 'content-header' });
		header.createEl('h2', { text: 'Today' });

		// Filter tasks due today (exclude completed)
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = this.formatDate(today);

		const todayTasks = this.tasks.filter(task => {
			if (task.status === 'done') return false;
			if (!task.dueDate) return false;
			return task.dueDate === todayStr || this.isOverdue(task.dueDate);
		});

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(todayTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		todayTasks.forEach(task => {
			this.renderTask(taskList, task);
		});

		if (todayTasks.length === 0) {
			taskList.createDiv({ text: 'No tasks due today', cls: 'empty-state' });
		}
	}

	renderDoneView(contentEl: HTMLElement) {
		const header = contentEl.createDiv({ cls: 'content-header' });
		header.createEl('h2', { text: 'Done' });

		// Filter completed tasks
		const doneTasks = this.tasks.filter(task => task.status === 'done');

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(doneTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		doneTasks.forEach(task => {
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

		// Filter tasks by project/section (exclude completed)
		let filteredTasks = this.tasks.filter(task => task.status !== 'done');
		if (this.selectedProject) {
			filteredTasks = filteredTasks.filter(task => task.project === this.selectedProject);
		}
		if (this.selectedSection) {
			filteredTasks = filteredTasks.filter(task => task.section === this.selectedSection);
		}

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(filteredTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		filteredTasks.forEach(task => {
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

		// Task name (editable)
		const taskNameEl = taskContent.createDiv({ cls: 'task-name' });
		taskNameEl.contentEditable = 'true';
		taskNameEl.setText(task.taskName);
		taskNameEl.addEventListener('blur', async () => {
			const newName = taskNameEl.getText().trim();
			if (newName !== task.taskName) {
				task.taskName = newName;
				await this.updateTask(task);
			}
		});
		taskNameEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				taskNameEl.blur();
			}
		});

		// Metadata
		const metadata = taskContent.createDiv({ cls: 'task-metadata' });

		// Due date (editable)
		if (task.dueDate) {
			const dueEl = metadata.createSpan({ cls: 'task-due' });
			dueEl.innerHTML = `📅 <span contenteditable="true" class="editable-date">${task.dueDate}</span>`;
			const dateSpan = dueEl.querySelector('.editable-date') as HTMLElement;

			if (this.isOverdue(task.dueDate)) {
				dueEl.addClass('overdue');
			}

			dateSpan?.addEventListener('blur', async () => {
				const newDate = dateSpan.getText().trim();
				if (newDate !== task.dueDate && this.isValidDate(newDate)) {
					task.dueDate = newDate;
					await this.updateTask(task);
					this.renderView();
				} else if (!this.isValidDate(newDate)) {
					new Notice('Invalid date format. Use YYYY-MM-DD');
					dateSpan.setText(task.dueDate || '');
				}
			});

			dateSpan?.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					dateSpan.blur();
				}
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

		// ETA (editable)
		if (task.eta) {
			const etaEl = metadata.createSpan({ cls: 'task-eta' });
			etaEl.innerHTML = `⏱️ <span contenteditable="true" class="editable-eta">${task.eta}</span>`;
			const etaSpan = etaEl.querySelector('.editable-eta') as HTMLElement;

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

		projectEl.innerHTML = `📁 <span contenteditable="true" class="editable-project">${projectText}</span>`;
		const projectSpan = projectEl.querySelector('.editable-project') as HTMLElement;

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
	}

	async toggleTask(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		if (task.lineNumber < lines.length) {
			const line = lines[task.lineNumber];

			if (task.status === 'todo') {
				// Mark as done and add strikethrough
				lines[task.lineNumber] = line.replace('- [ ]', '- [x]');
			} else {
				// Mark as todo and remove strikethrough
				lines[task.lineNumber] = line.replace('- [x]', '- [ ]');
			}

			await this.app.vault.modify(file, lines.join('\n'));
			await this.loadTasks();
			this.renderView();
		}
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

			// Build the project/section tag
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

			if (task.project) {
				newLine += ` ${projectTag}`;
			}

			lines[task.lineNumber] = newLine;
			await this.app.vault.modify(file, lines.join('\n'));
			await this.loadTasks();
		}
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

	async createNewTask() {
		const file = this.app.vault.getAbstractFileByPath(this.plugin.settings.taskFile);

		if (!file || !(file instanceof TFile)) {
			new Notice('Task file not found');
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Create new task at the top of the file (after any headers)
		const today = this.formatDate(new Date());
		const taskIdentifier = this.plugin.settings.taskIdentifier;
		const newTaskLine = `- [ ] New Task due::${today} eta::1:00 ${taskIdentifier}`;

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

		new Notice('New task created!');
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
			// Generate future occurrences for timeline views
			const nextOccurrences = this.calculateNextOccurrences(recurringTask, 30); // Next 30 occurrences

			for (const occurrence of nextOccurrences) {
				const occurrenceDate = this.formatDate(new Date(occurrence));

				// Create a virtual task for this occurrence
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

		// Move to next occurrence if start date is in the past
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		while (currentDate < today) {
			this.advanceDate(currentDate, interval, unit);
		}

		// Generate occurrences
		while (occurrences.length < count) {
			if (endDate && currentDate > endDate) break;

			// Check if this occurrence matches the day constraints
			if (this.matchesRecurrenceConstraints(currentDate, task, unit)) {
				occurrences.push(this.formatDate(currentDate));
			}

			this.advanceDate(currentDate, interval, unit);
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

		// Calculate date range
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const endDate = new Date(today);
		endDate.setDate(endDate.getDate() + this.selectedTimelineView.days);

		// Filter tasks in date range
		const timelineTasks = this.tasks.filter(task => {
			if (task.status === 'done') return false;
			if (!task.dueDate) return false;
			const taskDate = new Date(task.dueDate);
			return taskDate >= today && taskDate <= endDate;
		});

		// Sort by date
		timelineTasks.sort((a, b) => {
			if (!a.dueDate || !b.dueDate) return 0;
			return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
		});

		// Calculate total ETA
		const totalEta = this.calculateTotalEta(timelineTasks);
		const etaDisplay = contentEl.createDiv({ cls: 'eta-summary' });
		etaDisplay.createSpan({ text: `Total Time: ${totalEta}` });

		// Render tasks grouped by date
		const taskList = contentEl.createDiv({ cls: 'task-list' });
		let currentDate = '';

		timelineTasks.forEach(task => {
			if (task.dueDate && task.dueDate !== currentDate) {
				currentDate = task.dueDate;
				const dateHeader = taskList.createDiv({ cls: 'date-group-header' });
				dateHeader.setText(this.formatDateHeader(new Date(currentDate)));
			}
			this.renderTask(taskList, task);
		});

		if (timelineTasks.length === 0) {
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
}

// Modal for creating custom timeline views
class TimelineViewModal extends Modal {
	onSubmit: (name: string, days: number) => void;
	nameInput: HTMLInputElement;
	daysInput: HTMLInputElement;

	constructor(app: App, onSubmit: (name: string, days: number) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Create Custom Timeline View' });

		// Name input
		const nameContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		nameContainer.createEl('label', { text: 'View Name:' });
		this.nameInput = nameContainer.createEl('input', {
			type: 'text',
			placeholder: 'e.g., Next 14 Days'
		});

		// Days input
		const daysContainer = contentEl.createDiv({ cls: 'modal-input-container' });
		daysContainer.createEl('label', { text: 'Number of Days:' });
		this.daysInput = daysContainer.createEl('input', {
			type: 'number',
			placeholder: 'e.g., 14'
		});
		this.daysInput.value = '7';

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const submitBtn = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
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

		containerEl.createEl('h2', { text: 'Task Manager Settings' });

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

		containerEl.createEl('h3', { text: 'Task Format' });
		containerEl.createEl('p', { text: 'Tasks should follow this format:' });
		containerEl.createEl('pre', {
			text: '- [ ] Task name due::2024-01-15 eta::1:30 #tlog/project/section',
			cls: 'task-format-example'
		});

		containerEl.createEl('ul').innerHTML = `
			<li><strong>Checkbox:</strong> - [ ] for todo, - [x] for done</li>
			<li><strong>Due date:</strong> due::YYYY-MM-DD</li>
			<li><strong>Estimated time:</strong> eta::HH:MM</li>
			<li><strong>Project structure:</strong> ${this.plugin.settings.taskIdentifier}/project/section</li>
		`;
	}
}
