/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function stubServiceWorker(controller) {
	const listeners = {}
	vi.stubGlobal("navigator", {
		onLine: true,
		serviceWorker: {
			controller,
			addEventListener: (type, fn) => {
				listeners[type] = fn
			},
		},
	})
	return listeners
}

describe("watchForUpdates", () => {
	beforeEach(() => vi.resetModules())
	afterEach(() => vi.unstubAllGlobals())

	it("is no update when the first worker takes over a page it didn't load", async () => {
		const listeners = stubServiceWorker(null)
		const { watchForUpdates, updateReady } = await import("@/utils/appUpdate")
		watchForUpdates({ update: vi.fn(() => Promise.resolve()) })

		listeners.controllerchange()
		expect(updateReady.value).toBe(false)
		// A later worker taking over is one
		listeners.controllerchange()
		expect(updateReady.value).toBe(true)
	})

	it("is an update when a new worker replaces the one the page loaded with", async () => {
		const listeners = stubServiceWorker({})
		const { watchForUpdates, updateReady } = await import("@/utils/appUpdate")
		watchForUpdates({ update: vi.fn(() => Promise.resolve()) })

		listeners.controllerchange()
		expect(updateReady.value).toBe(true)
	})

	it("looks for a new version now and then", async () => {
		vi.useFakeTimers()
		stubServiceWorker({})
		const { watchForUpdates } = await import("@/utils/appUpdate")
		const update = vi.fn(() => Promise.resolve())
		watchForUpdates({ update })

		vi.advanceTimersByTime(5 * 60 * 1000)
		expect(update).toHaveBeenCalledTimes(1)
		vi.useRealTimers()
	})
})
