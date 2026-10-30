/**
 * Receipt footer from apps that hook `pos_next_receipt_footer` (e.g. receipt verification and a
 * Powered-by line): drawn on the receipts the POS builds in the browser, which are the ones printed for
 * sales made offline. Kept in localStorage so it still applies when the POS is offline.
 *
 * Config: { verify_url: string|null, tagline: string|null }
 * - verify_url: a QR code linking to `${verify_url}?o=<offline id>`, on receipts of offline sales only.
 *   The server finds the invoice from the offline id once the sale syncs; online invoices are verified
 *   with the QR code their server print format carries.
 * - tagline: a line of small print beside the QR code.
 */
import qrcode from "qrcode-generator"

const STORAGE_KEY = "pos_next_receipt_footer"
// pos_offline_<crypto.randomUUID()>: random, so it can't be guessed from another receipt
const OFFLINE_ID =
	/^pos_offline_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function setReceiptFooter(config) {
	try {
		if (config && (config.verify_url || config.tagline)) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
		} else {
			localStorage.removeItem(STORAGE_KEY)
		}
	} catch {
		// Storage blocked: the footer is left off
	}
}

export function getReceiptFooter() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
	} catch {
		return null
	}
}

function escapeHTML(text) {
	return String(text).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	)
}

function qrSVG(text) {
	const qr = qrcode(0, "M")
	qr.addData(text)
	qr.make()
	return qr
		.createSvgTag({ cellSize: 2, margin: 1, scalable: true })
		.replace("<svg ", '<svg style="width:20mm;height:20mm;display:block" ')
}

/**
 * The footer's HTML for a receipt, or "" when there is nothing to add.
 * @param {Object} invoiceData - the receipt's invoice (its `name` is the offline id for offline sales)
 * @param {string} scanLabel - translated "Scan to verify"
 */
export function receiptFooterHTML(invoiceData, scanLabel = "Scan to verify") {
	const config = getReceiptFooter()
	if (!config) return ""
	const offlineId = invoiceData?.name || ""
	const showQR = !!config.verify_url && OFFLINE_ID.test(offlineId)
	const showTagline = !!config.tagline
	if (!showQR && !showTagline) return ""
	const url = showQR
		? `${config.verify_url}${config.verify_url.includes("?") ? "&" : "?"}o=${encodeURIComponent(offlineId)}`
		: ""
	const qr = showQR
		? `<div>${qrSVG(url)}<div style="font-size:7px;margin-top:2px">${escapeHTML(scanLabel)}</div></div>`
		: ""
	const tagline = showTagline
		? `<div style="font-size:8px;color:#555;white-space:nowrap;text-align:${
				showQR ? "right" : "center"
			}">${escapeHTML(config.tagline)}</div>`
		: ""
	// The same layout as the server print format's footer: QR code on the left, the line on the right
	return `<table class="shop-receipt-footer" style="width:100%;margin-top:8px;border-collapse:collapse"><tr>
		<td style="padding:0;vertical-align:bottom;width:1%">${qr}</td>
		<td style="padding:0 0 0 6px;vertical-align:bottom">${tagline}</td>
	</tr></table>`
}
