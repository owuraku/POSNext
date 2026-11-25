/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const silentPrintDoc = vi.fn()
const printOnReceiptPage = vi.fn()
vi.mock("@/utils/printInvoice", () => ({ silentPrintDoc, printOnReceiptPage }))
vi.mock("../printInvoice", () => ({ silentPrintDoc, printOnReceiptPage }))

// The report's page "loads" in its frame as soon as the frame is added
function loadFramesWhenAdded() {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node.tagName === "IFRAME") {
					// The report's page, as Frappe's /printview renders it (or its error page, when a test says so)
					const page = document.implementation.createHTMLDocument("print")
					if (globalThis.__printError) page.body.textContent = globalThis.__printError
					else page.body.innerHTML = '<div class="print-format">EOD</div>'
					Object.defineProperty(node, "contentWindow", {
						value: { document: page, addEventListener: () => {} },
					})
					setTimeout(() => node.onload?.(), 0)
				}
			}
		}
	})
	observer.observe(document.body, { childList: true })
	return observer
}

describe("printEODReport", () => {
	let observer
	beforeEach(() => {
		silentPrintDoc.mockReset()
		printOnReceiptPage.mockReset()
		observer = loadFramesWhenAdded()
	})
	afterEach(() => {
		observer.disconnect()
		globalThis.__printError = null
	})

	it("prints in the browser, not through QZ Tray, when Silent Print is off", async () => {
		const { printEODReport } = await import("@/utils/printEod")
		await expect(printEODReport("POS-CLO-0001")).resolves.toBe("browser")
		expect(silentPrintDoc).not.toHaveBeenCalled()
		expect(printOnReceiptPage).toHaveBeenCalledTimes(1)
		const frame = document.querySelector("iframe")
		expect(frame.src).toContain("doctype=POS+Closing+Shift")
		expect(frame.src).toContain("name=POS-CLO-0001")
		expect(frame.src).toContain("format=POS+Next+EOD+Report")
	})

	it("prints through QZ Tray when Silent Print is on", async () => {
		silentPrintDoc.mockResolvedValue(true)
		const { printEODReport } = await import("@/utils/printEod")
		await expect(printEODReport("POS-CLO-0002", { silent: true })).resolves.toBe("silent")
		expect(silentPrintDoc).toHaveBeenCalledWith("POS Closing Shift", "POS-CLO-0002", "POS Next EOD Report")
		expect(printOnReceiptPage).not.toHaveBeenCalled()
	})

	it("falls back to the browser when QZ Tray fails", async () => {
		silentPrintDoc.mockRejectedValue(new Error("Unable to establish connection with QZ"))
		const { printEODReport } = await import("@/utils/printEod")
		await expect(printEODReport("POS-CLO-0003", { silent: true })).resolves.toBe("browser")
		expect(printOnReceiptPage).toHaveBeenCalledTimes(1)
	})

	it("doesn't print Frappe's error page as the report", async () => {
		globalThis.__printError = "Print Format POS Next EOD Report not found"
		const { printEODReport } = await import("@/utils/printEod")
		await expect(printEODReport("POS-CLO-0004")).rejects.toThrow("not found")
		expect(printOnReceiptPage).not.toHaveBeenCalled()
	})
})
