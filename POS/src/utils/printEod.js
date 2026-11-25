import { logger } from "@/utils/logger"
import { printOnReceiptPage, silentPrintDoc } from "./printInvoice"

const log = logger.create("PrintEod")
const EOD_PRINT_FORMAT = "POS Next EOD Report"
// How long the report's page may take to load before printing is given up
const LOAD_TIMEOUT_MS = 30000

/**
 * Print a document in the browser's print dialog, from a hidden frame: no popup, so nothing for the browser to
 * block (the end-of-day report prints after the server has closed the shift, long after the tap that closed it).
 * Resolves once the print dialog has opened.
 */
export function browserPrintDoc(doctype, name, printFormat) {
	return new Promise((resolve, reject) => {
		const params = new URLSearchParams({
			doctype,
			name,
			format: printFormat,
			no_letterhead: 1,
			_lang: "en",
			_t: Date.now(),
		})
		const frame = document.createElement("iframe")
		frame.setAttribute("aria-hidden", "true")
		// Off screen but full size: the report is laid out (and its page length measured) as in the receipt
		// window's 800 x 600, not squeezed to nothing
		frame.style.cssText =
			"position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none"
		const remove = () => setTimeout(() => frame.remove(), 1000)
		const timer = setTimeout(() => {
			remove()
			reject(new Error("The report took too long to load"))
		}, LOAD_TIMEOUT_MS)
		frame.onload = async () => {
			clearTimeout(timer)
			try {
				const win = frame.contentWindow
				// Frappe's error page (no such format, no permission) loads too: not printed as the report
				if (!win.document.querySelector(".print-format")) {
					const message = (
						win.document.body?.innerText ||
						win.document.body?.textContent ||
						""
					)
						.trim()
						.slice(0, 200)
					throw new Error(message || "The report could not be shown")
				}
				try {
					await win.document.fonts?.ready
				} catch (error) {
					// Printed with what has loaded
				}
				win.addEventListener("afterprint", remove, { once: true })
				printOnReceiptPage(win)
				// Where printing doesn't wait for the dialog (mobiles), the frame goes a little later
				setTimeout(remove, 60000)
				resolve()
			} catch (error) {
				remove()
				reject(error)
			}
		}
		frame.src = `/printview?${params}`
		document.body.appendChild(frame)
	})
}

/**
 * The shift's end-of-day report. With Silent Print on (POS Settings), straight to the printer through QZ Tray,
 * and the browser's print dialog if QZ Tray isn't there or fails; otherwise the browser's print dialog.
 * Returns how it printed: "silent" or "browser".
 */
export async function printEODReport(
	closingShiftName,
	{ silent = false } = {},
) {
	if (silent) {
		try {
			await silentPrintDoc(
				"POS Closing Shift",
				closingShiftName,
				EOD_PRINT_FORMAT,
			)
			return "silent"
		} catch (error) {
			log.warn(
				"Silent EOD print failed, printing in the browser:",
				error?.message || error,
			)
		}
	}
	await browserPrintDoc("POS Closing Shift", closingShiftName, EOD_PRINT_FORMAT)
	return "browser"
}
