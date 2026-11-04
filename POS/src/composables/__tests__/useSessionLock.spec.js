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
