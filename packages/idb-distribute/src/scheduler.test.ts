import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler";

describe("Scheduler", () => {
	let scheduler: Scheduler;

	beforeEach(() => {
		scheduler = new Scheduler(100); // 100ms interval for testing
	});

	afterEach(() => {
		scheduler.stop();
	});

	describe("constructor", () => {
		it("should create scheduler with default interval of 300ms", () => {
			const defaultScheduler = new Scheduler();
			expect(defaultScheduler.isRunning()).toBe(false);
			expect(defaultScheduler.getRegisteredTasks()).toEqual([]);
		});

		it("should create scheduler with custom interval", () => {
			const customScheduler = new Scheduler(500);
			expect(customScheduler.isRunning()).toBe(false);
			expect(customScheduler.getRegisteredTasks()).toEqual([]);
		});
	});

	describe("registerTask", () => {
		it("should register a task", () => {
			const task = vi.fn().mockResolvedValue(undefined);
			scheduler.registerTask("task1", task);

			expect(scheduler.getRegisteredTasks()).toEqual(["task1"]);
		});

		it("should register multiple tasks", () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			expect(scheduler.getRegisteredTasks()).toEqual(["task1", "task2"]);
		});

		it("should overwrite existing task with same ID", () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task1", task2);

			expect(scheduler.getRegisteredTasks()).toEqual(["task1"]);
		});
	});

	describe("unregisterTask", () => {
		it("should unregister an existing task", () => {
			const task = vi.fn().mockResolvedValue(undefined);
			scheduler.registerTask("task1", task);

			expect(scheduler.getRegisteredTasks()).toEqual(["task1"]);

			scheduler.unregisterTask("task1");

			expect(scheduler.getRegisteredTasks()).toEqual([]);
		});

		it("should do nothing when unregistering non-existent task", () => {
			scheduler.unregisterTask("nonexistent");
			expect(scheduler.getRegisteredTasks()).toEqual([]);
		});

		it("should not affect other tasks when unregistering", () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			scheduler.unregisterTask("task1");

			expect(scheduler.getRegisteredTasks()).toEqual(["task2"]);
		});
	});

	describe("tick", () => {
		it("should execute all registered tasks", async () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			await scheduler.tick();

			expect(task1).toHaveBeenCalledTimes(1);
			expect(task2).toHaveBeenCalledTimes(1);
		});

		it("should execute tasks in registration order", async () => {
			const executionOrder: string[] = [];

			const task1 = vi.fn().mockImplementation(() => {
				executionOrder.push("task1");
				return Promise.resolve();
			});

			const task2 = vi.fn().mockImplementation(() => {
				executionOrder.push("task2");
				return Promise.resolve();
			});

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			await scheduler.tick();

			expect(executionOrder).toEqual(["task1", "task2"]);
		});

		it("should handle task errors gracefully", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });
			const errorTask = vi.fn().mockRejectedValue(new Error("Task failed"));
			const successTask = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("errorTask", errorTask);
			scheduler.registerTask("successTask", successTask);

			await scheduler.tick();

			expect(errorTask).toHaveBeenCalledTimes(1);
			expect(successTask).toHaveBeenCalledTimes(1);
			expect(consoleSpy).toHaveBeenCalledWith("Task 'errorTask' failed:", expect.any(Error));

			consoleSpy.mockRestore();
		});

		it("should continue executing tasks after one fails", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });
			const errorTask = vi.fn().mockRejectedValue(new Error("Task failed"));
			const successTask1 = vi.fn().mockResolvedValue(undefined);
			const successTask2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("successTask1", successTask1);
			scheduler.registerTask("errorTask", errorTask);
			scheduler.registerTask("successTask2", successTask2);

			await scheduler.tick();

			expect(successTask1).toHaveBeenCalledTimes(1);
			expect(errorTask).toHaveBeenCalledTimes(1);
			expect(successTask2).toHaveBeenCalledTimes(1);

			consoleSpy.mockRestore();
		});

		it("should not execute tasks that are not registered", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			await scheduler.tick();

			expect(task).not.toHaveBeenCalled();
		});

		it("should handle async tasks properly", async () => {
			let resolveTask: () => void;
			const taskPromise = new Promise<void>((resolve) => {
				resolveTask = resolve;
			});

			const asyncTask = vi.fn().mockImplementation(() => taskPromise);
			scheduler.registerTask("asyncTask", asyncTask);

			// Start tick but don't await it yet
			const tickPromise = scheduler.tick();

			expect(asyncTask).toHaveBeenCalledTimes(1);

			// Resolve the async task
			resolveTask!();

			// Now tick should complete
			await tickPromise;
		});

		it("should execute tasks sequentially", async () => {
			const executionOrder: string[] = [];
			let resolveTask1: () => void;
			let resolveTask2: () => void;

			const task1Promise = new Promise<void>((resolve) => {
				resolveTask1 = resolve;
			});

			const task2Promise = new Promise<void>((resolve) => {
				resolveTask2 = resolve;
			});

			const task1 = vi.fn().mockImplementation(async () => {
				executionOrder.push("task1-start");
				await task1Promise;
				executionOrder.push("task1-end");
			});

			const task2 = vi.fn().mockImplementation(async () => {
				executionOrder.push("task2-start");
				await task2Promise;
				executionOrder.push("task2-end");
			});

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			const tickPromise = scheduler.tick();

			// Give a moment for task1 to start
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(executionOrder).toEqual(["task1-start"]);

			// Resolve task1
			resolveTask1!();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(executionOrder).toEqual(["task1-start", "task1-end", "task2-start"]);

			// Resolve task2
			resolveTask2!();
			await tickPromise;
			expect(executionOrder).toEqual(["task1-start", "task1-end", "task2-start", "task2-end"]);
		});
	});

	describe("start", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should start the scheduler", () => {
			expect(scheduler.isRunning()).toBe(false);

			const intervalId = scheduler.start();

			expect(scheduler.isRunning()).toBe(true);
			expect(intervalId).toBeDefined();
		});

		it("should return the same interval ID when already running", () => {
			const intervalId1 = scheduler.start();
			const intervalId2 = scheduler.start();

			expect(intervalId1).toBe(intervalId2);
			expect(scheduler.isRunning()).toBe(true);
		});

		it("should call tick method at intervals", async () => {
			const tickSpy = vi.spyOn(scheduler, "tick").mockResolvedValue();

			scheduler.start();

			// No tick called yet
			expect(tickSpy).not.toHaveBeenCalled();

			// Advance time by one interval
			await vi.advanceTimersByTimeAsync(100);

			expect(tickSpy).toHaveBeenCalledTimes(1);

			// Advance time by another interval
			await vi.advanceTimersByTimeAsync(100);

			expect(tickSpy).toHaveBeenCalledTimes(2);

			tickSpy.mockRestore();
		});
	});

	describe("stop", () => {
		it("should stop the scheduler", () => {
			scheduler.start();
			expect(scheduler.isRunning()).toBe(true);

			scheduler.stop();
			expect(scheduler.isRunning()).toBe(false);
		});

		it("should do nothing when stopping already stopped scheduler", () => {
			expect(scheduler.isRunning()).toBe(false);

			scheduler.stop();
			expect(scheduler.isRunning()).toBe(false);
		});

		it("should allow restart after stop", () => {
			scheduler.start();
			scheduler.stop();
			scheduler.start();

			expect(scheduler.isRunning()).toBe(true);
		});
	});

	describe("isRunning", () => {
		it("should return false when scheduler is not started", () => {
			expect(scheduler.isRunning()).toBe(false);
		});

		it("should return true when scheduler is running", () => {
			scheduler.start();
			expect(scheduler.isRunning()).toBe(true);
		});

		it("should return false after scheduler is stopped", () => {
			scheduler.start();
			scheduler.stop();
			expect(scheduler.isRunning()).toBe(false);
		});
	});

	describe("getRegisteredTasks", () => {
		it("should return empty array when no tasks registered", () => {
			expect(scheduler.getRegisteredTasks()).toEqual([]);
		});

		it("should return array of registered task IDs", () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			expect(scheduler.getRegisteredTasks()).toEqual(["task1", "task2"]);
		});

		it("should return updated array after unregistering tasks", () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			scheduler.unregisterTask("task1");

			expect(scheduler.getRegisteredTasks()).toEqual(["task2"]);
		});
	});

	describe("integration tests", () => {
		it("should handle complete lifecycle with tick", async () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			// Register tasks
			scheduler.registerTask("task1", task1);
			scheduler.registerTask("task2", task2);

			// Execute first tick
			await scheduler.tick();

			expect(task1).toHaveBeenCalledTimes(1);
			expect(task2).toHaveBeenCalledTimes(1);

			// Unregister one task
			scheduler.unregisterTask("task1");

			// Execute second tick
			await scheduler.tick();

			expect(task1).toHaveBeenCalledTimes(1); // Still 1
			expect(task2).toHaveBeenCalledTimes(2); // Increased to 2
		});

		it("should handle task registration during execution", async () => {
			const task1 = vi.fn().mockResolvedValue(undefined);
			const task2 = vi.fn().mockResolvedValue(undefined);

			scheduler.registerTask("task1", task1);

			// Execute tick
			await scheduler.tick();

			expect(task1).toHaveBeenCalledTimes(1);
			expect(task2).not.toHaveBeenCalled();

			// Register new task
			scheduler.registerTask("task2", task2);

			// Execute another tick
			await scheduler.tick();

			expect(task1).toHaveBeenCalledTimes(2);
			expect(task2).toHaveBeenCalledTimes(1);
		});

		it("should handle mixed sync and async tasks", async () => {
			const syncTask = vi.fn().mockReturnValue(Promise.resolve());
			const asyncTask = vi.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			scheduler.registerTask("syncTask", syncTask);
			scheduler.registerTask("asyncTask", asyncTask);

			await scheduler.tick();

			expect(syncTask).toHaveBeenCalledTimes(1);
			expect(asyncTask).toHaveBeenCalledTimes(1);
		});
	});
});
