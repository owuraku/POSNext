/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/data/user", () => ({
	userData: {
		getDisplayName: () => "Cashier",
		getImageUrl: () => null,
		getInitials: () => "C",
	},
}))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({ isSubmitting: false }),
}))
vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: false },
}))

import { useSessionLock } from "@/composables/useSessionLock"

describe("useSessionLock idle timer", () => {
	afterEach(() => {
		const { stopActivityTracking, clearLock } = useSessionLock()
		stopActivityTracking()
		clearLock()
		vi.useRealTimers()
	})

	it("locks after the timeout with no activity once tracking starts", () => {
		vi.useFakeTimers()
		const { configure, startActivityTracking, isLocked } = useSessionLock()
		configure({ enabled: true, timeoutMinutes: 1 })

		startActivityTracking()
		vi.advanceTimersByTime(60 * 1000)

		expect(isLocked.value).toBe(true)
	})
})

describe("useSessionLock locks only after the timeout without activity", () => {
	const MINUTE = 60 * 1000
	const setHidden = (hidden) => {
		Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
		document.dispatchEvent(new Event("visibilitychange"))
	}

	afterEach(() => {
		const { stopActivityTracking, clearLock } = useSessionLock()
		stopActivityTracking()
		clearLock()
		setHidden(false)
		localStorage.clear()
		vi.useRealTimers()
	})

	function start(timeoutMinutes = 5) {
		vi.useFakeTimers()
		const lock = useSessionLock()
		lock.configure({ enabled: true, timeoutMinutes })
		lock.startActivityTracking()
		return lock
	}

	it("stays unlocked while being used, and locks once left alone for the timeout", () => {
		const { isLocked } = start(5)
		for (let i = 0; i < 4; i++) {
			vi.advanceTimersByTime(4 * MINUTE)
			document.dispatchEvent(new Event("pointerdown"))
		}
		expect(isLocked.value).toBe(false)
		vi.advanceTimersByTime(5 * MINUTE)
		expect(isLocked.value).toBe(true)
	})

	it("counts typing on a phone keyboard (input) as activity", () => {
		const { isLocked } = start(5)
		vi.advanceTimersByTime(4 * MINUTE)
		document.dispatchEvent(new Event("input"))
		vi.advanceTimersByTime(4 * MINUTE)
		expect(isLocked.value).toBe(false)
	})

	it("doesn't lock on leaving the tab or app for a moment (a receipt, a payment app)", () => {
		const { isLocked } = start(5)
		setHidden(true)
		expect(isLocked.value).toBe(false)
		vi.setSystemTime(Date.now() + 1 * MINUTE)
		setHidden(false)
		expect(isLocked.value).toBe(false)
	})

	it("locks on coming back after the timeout away, though timers didn't run meanwhile", () => {
		const { isLocked } = start(5)
		setHidden(true)
		vi.setSystemTime(Date.now() + 6 * MINUTE)
		setHidden(false)
		expect(isLocked.value).toBe(true)
	})

	it("opens unlocked after a reload when last used moments ago, locked when long unused", () => {
		localStorage.setItem("pos_session_last_active", JSON.stringify({ user: null, time: Date.now() - 30 * 1000 }))
		let lock = start(5)
		expect(lock.isLocked.value).toBe(false)
		lock.stopActivityTracking()

		localStorage.setItem("pos_session_last_active", JSON.stringify({ user: null, time: Date.now() - 10 * MINUTE }))
		lock = start(5)
		expect(lock.isLocked.value).toBe(true)
	})

	it("counts a timeout set after tracking started (settings loaded late) from the last activity", () => {
		localStorage.setItem("pos_session_last_active", JSON.stringify({ user: null, time: Date.now() - 3 * MINUTE }))
		const lock = start(5)
		expect(lock.isLocked.value).toBe(false)
		lock.configure({ enabled: true, timeoutMinutes: 2 })
		expect(lock.isLocked.value).toBe(true)
	})
})

describe("useSessionLock without Web Crypto (dev mode over plain http)", () => {
	afterEach(() => vi.unstubAllGlobals())

	it("skips the offline unlock hash instead of failing the login", async () => {
		vi.stubGlobal("crypto", { getRandomValues: (a) => a })
		const { cachePasswordHashFromLogin } = useSessionLock()

		await expect(cachePasswordHashFromLogin("secret")).resolves.toBeUndefined()
	})
})

describe("useSessionLock PIN unlock", () => {
	afterEach(() => {
		localStorage.clear()
		useSessionLock().clearLock()
	})

	it("shows the server's reason a PIN was refused", async () => {
		const { call } = await import("@/utils/apiWrapper")
		call.mockResolvedValueOnce({ verified: false, message: "Too many wrong PINs" })
		const { unlock, verifyError } = useSessionLock()

		await expect(unlock("2580", "pin")).resolves.toEqual({ success: false })
		expect(call).toHaveBeenLastCalledWith("pos_next.api.auth.verify_session_pin", { pin: "2580" })
		expect(verifyError.value).toBe("Too many wrong PINs")
	})

	it("falls back to the password when the user no longer has a PIN", async () => {
		const { call } = await import("@/utils/apiWrapper")
		call.mockResolvedValueOnce({ verified: false, no_pin: true, message: "No PIN" })
		const { unlock, setPinInfo, pinInfo } = useSessionLock()
		setPinInfo({ has_pin: true, length: 4 })

		await unlock("2580", "pin")
		expect(pinInfo.value.hasPin).toBe(false)
	})
})
