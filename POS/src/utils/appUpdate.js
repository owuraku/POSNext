import { ref } from "vue"

/**
 * A new version of the POS was installed while it was open: its service worker took over (skipWaiting,
 * clientsClaim). The page keeps running the old code until it reloads, which POSSale does once the till is free.
 */
export const updateReady = ref(false)

const CHECK_MS = 5 * 60 * 1000

/** Look for a new version now and then (the browser only looks when the page is opened), and note when one takes over. */
export function watchForUpdates(registration) {
	// The first worker taking over a page it didn't load is no update
	let controlled = Boolean(navigator.serviceWorker.controller)
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (controlled) updateReady.value = true
		controlled = true
	})
	const check = () => {
		if (navigator.onLine && !document.hidden)
			registration.update().catch(() => {})
	}
	setInterval(check, CHECK_MS)
	document.addEventListener("visibilitychange", check)
}
