export class Scheduler {
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private readonly intervalMs: number;
	private readonly tasks: Map<string, () => Promise<void>> = new Map();

	constructor(intervalMs: number = 300) {
		this.intervalMs = intervalMs;
	}

	/**
	 * Register a task to be executed on each interval
	 * @param taskId Unique identifier for the task
	 * @param task Async function to execute
	 */
	registerTask(taskId: string, task: () => Promise<void>): void {
		this.tasks.set(taskId, task);
	}

	/**
	 * Unregister a task from the scheduler
	 * @param taskId Unique identifier for the task
	 */
	unregisterTask(taskId: string): void {
		this.tasks.delete(taskId);
	}

	/**
	 * Start the scheduler
	 * @returns The interval ID
	 */
	start(): ReturnType<typeof setInterval> {
		if (this.intervalId !== null) {
			return this.intervalId; // Already running, return existing
		}

		this.intervalId = setInterval(async () => {
			await this.tick();
		}, this.intervalMs);

		return this.intervalId;
	}

	/**
	 * Execute all registered tasks
	 */
	async tick() {
		for (const [taskId, task] of this.tasks) {
			try {
				await task();
			} catch (error) {
				console.error(`Task '${taskId}' failed:`, error);
			}  
		}
	}

	/**
	 * Stop the scheduler
	 */
	stop(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * Check if the scheduler is currently running
	 */
	isRunning(): boolean {
		return this.intervalId !== null;
	}

	/**
	 * Get the list of registered task IDs
	 */
	getRegisteredTasks(): string[] {
		return Array.from(this.tasks.keys());
	}
}
