import { call } from "@/utils/apiWrapper";
import { logger } from "@/utils/logger";
import { getOfflineReceiptPayload } from "@/utils/offline/offlineReceiptCache";
import { getOfflineInvoiceByOfflineId } from "@/utils/offline/sync";
import { offlineWorker } from "@/utils/offline/workerClient";
import { printHTML as qzPrintHTML } from "@/utils/qzTray";
import { escapeHTML, getReceiptFooter, receiptFooterHTML } from "@/utils/receiptFooter";

const log = logger.create("PrintInvoice");

const DEFAULT_PRINT_FORMAT = "POS Next Receipt";

// ============================================================================
// Shared helpers
// ============================================================================

function getSalesPersonNames(invoiceData) {
	const salesTeam = invoiceData.sales_team;
	if (!Array.isArray(salesTeam) || salesTeam.length === 0) return "";
	return salesTeam
		.map((row) => row.sales_person_name || row.sales_person)
		.filter(Boolean)
		.join(", ");
}

/** Sales Invoices not yet on the server (offline queue / local receipt id). */
export function isLocalOnlyInvoiceName(name) {
	return (
		typeof name === "string" &&
		(name.startsWith("OFFLINE-") || name.startsWith("pos_offline_"))
	);
}

/**
 * Fire-and-forget: flag the queued invoice as printed so a later edit
 * can warn the cashier a physical receipt is already in the customer's hands.
 * Silently no-ops for synced / server-side invoices.
 */
function flagOfflineInvoicePrinted(invoiceName) {
	if (!isLocalOnlyInvoiceName(invoiceName)) return;
	// Don't await — printing should never block on this bookkeeping call.
	offlineWorker.markOfflineInvoicePrinted(invoiceName).catch((err) => {
		log.warn("Failed to mark offline invoice printed:", err?.message || err);
	});
}

/**
 * Build a minimal printable receipt doc from a raw queued invoice payload
 * (the dict stored in IndexedDB invoice_queue.data). Used when sessionStorage
 * has been wiped but the invoice is still in the local queue.
 */
function receiptDocFromQueuedInvoice(offlineId, raw) {
	const items = Array.isArray(raw.items) ? raw.items : [];
	const payments = Array.isArray(raw.payments) ? raw.payments : [];
	const grandTotal = Number.parseFloat(raw.grand_total) || 0;
	const paidAmount = payments.reduce((sum, p) => sum + (Number.parseFloat(p.amount) || 0), 0);
	return {
		name: offlineId,
		doctype: "Sales Invoice",
		is_offline: true,
		pos_profile: raw.pos_profile,
		posting_date: raw.posting_date || new Date().toISOString().slice(0, 10),
		company: raw.company,
		customer_name: raw.customer,
		sales_team: raw.sales_team,
		coupon_code: raw.coupon_code,
		items: items.map((item) => ({
			...item,
			quantity: item.quantity ?? item.qty,
		})),
		grand_total: grandTotal,
		total_taxes_and_charges: Number.parseFloat(raw.total_tax) || 0,
		// total_discount also counts the item discounts, which the item rates already carry
		discount_amount: Math.max(
			0,
			(Number.parseFloat(raw.total_discount) || 0) -
				items.reduce((sum, item) => sum + (Number.parseFloat(item.discount_amount) || 0), 0),
		),
		payments,
		paid_amount: paidAmount,
		change_amount: Number.parseFloat(raw.change_amount) || 0,
		outstanding_amount: Math.max(0, grandTotal - paidAmount),
		status: grandTotal - paidAmount < 0.01 ? "Paid" : "Unpaid",
		docstatus: 0,
	};
}

/**
 * Hydrate a local-only invoice from cache. Checks sessionStorage first
 * (fast path, survives within the tab), then falls back to IndexedDB
 * (survives page reloads while the invoice is still in the offline queue).
 * Prevents server print / get_invoice for synthetic pos_offline_* ids.
 */
export async function hydrateLocalOnlyInvoice(invoiceData) {
	if (!invoiceData?.name || !isLocalOnlyInvoiceName(invoiceData.name)) return invoiceData;
	if (invoiceData.items?.length > 0) return invoiceData;

	const cached = getOfflineReceiptPayload(invoiceData.name);
	if (cached?.items?.length > 0) return cached;

	// sessionStorage wiped (page reload) — rebuild from IndexedDB queue.
	try {
		const queued = await getOfflineInvoiceByOfflineId(invoiceData.name);
		if (queued?.items?.length > 0) {
			return receiptDocFromQueuedInvoice(invoiceData.name, queued);
		}
	} catch (err) {
		log.warn("IndexedDB hydrate fallback failed:", err?.message || err);
	}

	return invoiceData;
}

// The shop's receipt design, the same as Simple Shop's "Default POS Receipt" print format
const RECEIPT_STYLES = `
	/* Thermal printers lose thin strokes and greys: pure black throughout; regular weight, key parts bold */
	body {
		font-family: Consolas, "Lucida Console", "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace;
		color: #000000; background: #ffffff; font-size: 12px; margin: 0; padding: 0;
	}
	.receipt-container {
		font-family: Consolas, "Lucida Console", "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace;
		font-weight: normal; color: #000000;
		width: 72mm; margin: 0 auto; padding: 5px;
	}
	.text-center { text-align: center; }
	.text-right { text-align: right; }
	.bold { font-weight: bold; }
	.receipt-container * { color: #000000 !important; }
	.shop-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
	.shop-contact { font-size: 11px; line-height: 1.3; margin-bottom: 8px; }
	.divider { border-top: 1px dashed #000000; margin: 6px 0; }
	.meta-table, .item-table { width: 100%; border-collapse: collapse; font-size: 11px; }
	.meta-table td { padding: 1px 0; line-height: 1.2; }
	.meta-table td:first-child { white-space: nowrap; padding-right: 6px; }
	.item-table th { border-bottom: 1px solid #000000; padding-bottom: 4px; font-size: 11px; font-weight: bold; }
	.item-table td { padding: 5px 0; vertical-align: top; }
	/* A gap between the number columns, so a quantity and a rate in the thousands don't read as one figure */
	.item-table th + th, .item-table td + td { padding-left: 8px; }
	.item-note { font-size: 10px; }
	.grand-total-box { border: 1px solid #000000; padding: 6px; margin-top: 8px; }
	.grand-total-box table td { padding: 2px 0; }
	.offline-badge { text-align: center; font-size: 10px; font-weight: bold; border: 1px dashed #000; padding: 3px; margin: 6px 0; }
	.footer { margin-top: 14px; font-size: 10px; line-height: 1.4; }
	@media print {
		@page { margin: 0; }
		body { width: 100%; margin: 0; }
		.receipt-container { width: 100%; }
		.no-print { display: none; }
	}
`

/** 1234.5 → "1,234.50", as the print format's "{:,.2f}" */
function formatAmount(amount) {
	return (Number.parseFloat(amount) || 0).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

function formatQty(qty) {
	const n = Number.parseFloat(qty) || 0
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

/** "DD-MM-YYYY HH:MM" from the invoice's posting date and time (now, for a sale just made offline) */
function formatReceiptDate(invoiceData) {
	const pad = (n) => String(n).padStart(2, "0")
	const now = new Date()
	const [y, m, d] = String(invoiceData.posting_date || "").split("-")
	const date =
		y && m && d
			? `${d.slice(0, 2)}-${m}-${y}`
			: `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`
	const time = invoiceData.posting_time
		? String(invoiceData.posting_time)
				.split(":")
				.slice(0, 2)
				.map((p) => pad(Number.parseInt(p, 10) || 0))
				.join(":")
		: `${pad(now.getHours())}:${pad(now.getMinutes())}`
	return `${date} ${time}`
}

/**
 * Inner receipt HTML (no shell). Used for local/offline invoices and QZ Tray. The same design as the
 * "Default POS Receipt" print format; the shop details, cashier and walk-in customer come from bootstrap
 * (kept for offline use, see receiptFooter.js).
 */
export function buildReceiptHTML(invoiceData) {
	const shop = getReceiptFooter() || {}
	const currency = escapeHTML(invoiceData.currency || "")
	const money = (amount) =>
		`${currency ? `${currency} ` : ""}${formatAmount(amount)}`
	const items = invoiceData.items || []
	const payments = (invoiceData.payments || []).filter((p) =>
		Number.parseFloat(p.amount),
	)
	const netTotal = Number.parseFloat(invoiceData.grand_total) || 0
	const grandTotal = Number.parseFloat(invoiceData.rounded_total) || netTotal
	const outstanding = Number.parseFloat(invoiceData.outstanding_amount) || 0
	const change = Number.parseFloat(invoiceData.change_amount) || 0
	const taxes = Number.parseFloat(invoiceData.total_taxes_and_charges) || 0
	const discount = Math.abs(Number.parseFloat(invoiceData.discount_amount) || 0)
	const customer = invoiceData.customer_name || invoiceData.customer
	// The walk-in customer's id or name (offline receipts may carry only the customer's name)
	const walkInNames = [shop.walk_in_customer, shop.walk_in_customer_name].filter(Boolean)
	const walkIn =
		!customer ||
		[invoiceData.customer, invoiceData.customer_name].some(
			(c) => c && walkInNames.includes(c),
		)
	const salesPersonNames = getSalesPersonNames(invoiceData)
	const totalQty = items.reduce(
		(sum, item) => sum + (Number.parseFloat(item.quantity ?? item.qty) || 0),
		0,
	)
	// A held (draft) sale printed for the customer: nothing is paid yet, and it must not pass for a receipt
	const isDraft = invoiceData.status === "Draft"
	const totalLabel = invoiceData.is_return
		? __("TOTAL REFUND")
		: outstanding > 0 || isDraft
			? __("TOTAL")
			: __("TOTAL PAID")

	const itemsHtml = items
		.map((item) => {
			const qty = Number.parseFloat(item.quantity ?? item.qty) || 0
			const rate = Number.parseFloat(item.rate ?? item.price_list_rate) || 0
			const amount =
				item.amount != null ? Number.parseFloat(item.amount) || 0 : qty * rate
			const notes = [
				item.is_free_item ? __("FREE") : "",
				Number.parseFloat(item.discount_amount) > 0
					? `${__("Discount")} -${formatAmount(item.discount_amount)}`
					: "",
				item.serial_no
					? `${__("Serial No:")} ${String(item.serial_no).replace(/\n/g, ", ")}`
					: "",
			].filter(Boolean)
			return `
				<tr>
					<td>
						<span class="bold">${escapeHTML(item.item_name || item.item_code)}</span>
						${notes.map((note) => `<div class="item-note">${escapeHTML(note)}</div>`).join("")}
					</td>
					<td class="text-right">${formatQty(qty)}</td>
					<td class="text-right">${formatAmount(rate)}</td>
					<td class="text-right">${formatAmount(amount)}</td>
				</tr>`
		})
		.join("")

	const row = (label, value, style = "") =>
		`<tr${style ? ` style="${style}"` : ""}><td>${label}</td><td class="text-right">${value}</td></tr>`

	return `
		<div class="receipt-container">
			<div class="text-center">
				<div class="shop-title">${escapeHTML(shop.shop_name || invoiceData.company || "POS Next")}</div>
				${
					shop.shop_phone || shop.shop_email
						? `<div class="shop-contact">${[
								shop.shop_phone
									? `${__("Tel")}: ${escapeHTML(shop.shop_phone)}`
									: "",
								shop.shop_email
									? `${__("Email")}: ${escapeHTML(shop.shop_email)}`
									: "",
							]
								.filter(Boolean)
								.join("<br>")}</div>`
						: ""
				}
			</div>

			<div class="divider"></div>

			<table class="meta-table">
				<tr><td class="bold">${__("RECEIPT #")}:</td><td class="text-right bold">${escapeHTML(invoiceData.name)}</td></tr>
				${shop.cashier ? row(`${__("Cashier")}:`, escapeHTML(invoiceData.cashier_name || shop.cashier)) : ""}
				${row(`${__("Date")}:`, formatReceiptDate(invoiceData))}
				${salesPersonNames ? row(`${__("Sales Person")}:`, escapeHTML(salesPersonNames)) : ""}
				${invoiceData.coupon_code ? row(`${__("Coupon")}:`, escapeHTML(invoiceData.coupon_code)) : ""}
			</table>

			${invoiceData.is_offline ? `<div class="offline-badge">${__("OFFLINE — PENDING SYNC")}</div>` : ""}
			${isDraft ? `<div class="offline-badge">${__("DRAFT — NOT PAID")}</div>` : ""}

			${
				walkIn
					? ""
					: `<div class="divider"></div>
			<table class="meta-table">
				<tr>
					<td class="bold">${__("Billed To")}:</td>
					<td class="text-right"><span class="bold">${escapeHTML(customer)}</span></td>
				</tr>
			</table>`
			}

			<div class="divider"></div>

			<table class="item-table">
				<thead>
					<tr>
						<th align="left" style="width: 38%;">${__("Item")}</th>
						<th align="right" style="width: 12%;">${__("Qty")}</th>
						<th align="right" style="width: 23%;">${__("Rate")}</th>
						<th align="right" style="width: 27%;">${__("Amount")}</th>
					</tr>
				</thead>
				<tbody>${itemsHtml}</tbody>
			</table>

			<div class="divider"></div>

			<table class="meta-table">
				${row(`<span class="bold">${__("Total Items Purchased")}:</span>`, `<span class="bold">${formatQty(totalQty)}</span>`)}
				${taxes || discount ? row(`${__("Subtotal")}:`, money(netTotal - taxes + discount)) : ""}
				${discount ? row(`${__("Discount")}:`, `-${money(discount)}`) : ""}
				${taxes ? row(`${__("Tax")}:`, money(taxes)) : ""}
			</table>

			<div class="grand-total-box">
				<table style="width: 100%; border-collapse: collapse;">
					${row(`${totalLabel}:`, money(grandTotal), "font-size: 14px; font-weight: bold;")}
					<tr><td colspan="2" style="border-top: 1px dashed #000000; padding-top: 4px;"></td></tr>
					${payments
						.map((p) =>
							row(
								`<span style="font-style: italic;">${__("Paid via {0}", [escapeHTML(p.mode_of_payment)])}:</span>`,
								money(p.amount),
								"font-size: 11px;",
							),
						)
						.join("")}
					${change > 0 ? row(`<span style="font-style: italic;">${__("Change Tendered")}:</span>`, money(change), "font-size: 11px;") : ""}
					${outstanding > 0 ? row(`${__("Balance Due")}:`, money(outstanding), "font-size: 12px; font-weight: bold;") : ""}
				</table>
			</div>

			<div class="divider"></div>

			<div class="footer text-center">
				<p class="bold" style="font-size: 12px; margin-bottom: 4px;">${escapeHTML(
					invoiceData.footer || __("Thank you for your purchase!"),
				)}</p>
			</div>

			${receiptFooterHTML(invoiceData, __("Scan to verify"))}
		</div>`
}

function buildReceiptDocumentHTML(invoiceData, { includeControls = false } = {}) {
	const controls = includeControls
		? `
			<div class="no-print" style="text-align: center; margin-top: 20px;">
				<button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer;">${__(
					"Print Receipt"
				)}</button>
				<button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; cursor: pointer; margin-left: 10px;">${__(
					"Close"
				)}</button>
			</div>`
		: "";
	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<title>${__("Invoice - {0}", [invoiceData.name])}</title>
			<style>${RECEIPT_STYLES}</style>
		</head>
		<body>
			${buildReceiptHTML(invoiceData)}
			${controls}
		</body>
		</html>`;
}

/**
 * Resolve print format & letterhead from a POS Profile.
 * Returns defaults when the profile lookup fails so callers always get a value.
 */
// A POS Profile's print format and letterhead, kept for a few minutes: read before every print otherwise
const profilePrintSettings = new Map();
const PROFILE_SETTINGS_TTL_MS = 5 * 60 * 1000;

async function resolvePrintSettings(posProfile, printFormat, letterhead) {
	if (printFormat) return { printFormat, letterhead };

	if (posProfile) {
		try {
			let cached = profilePrintSettings.get(posProfile);
			if (!cached || Date.now() - cached.at > PROFILE_SETTINGS_TTL_MS) {
				// Just the two fields, not the whole profile with its tables (call() returns the message itself)
				const values = await call("frappe.client.get_value", {
					doctype: "POS Profile",
					filters: posProfile,
					fieldname: ["print_format", "letter_head"],
				});
				cached = { doc: values, at: Date.now() };
				if (values) profilePrintSettings.set(posProfile, cached);
			}
			const doc = cached.doc;
			if (doc) {
				return {
					printFormat: doc.print_format || DEFAULT_PRINT_FORMAT,
					letterhead: letterhead || doc.letter_head || null,
				};
			}
		} catch (err) {
			log.warn("Could not fetch POS Profile print settings:", err);
		}
	}

	return { printFormat: DEFAULT_PRINT_FORMAT, letterhead };
}

// ============================================================================
// Browser printing (opens /printview in a new window)
// ============================================================================

// Receipt paper: an 80mm roll
const RECEIPT_WIDTH_MM = 80;
// The widest content still taken for a receipt (a full-page invoice format is left to the printer's paper)
const RECEIPT_MAX_CONTENT_MM = 100;
const PX_PER_MM = 96 / 25.4;

/**
 * Print a receipt on a page as wide as the roll and as long as the receipt, then print. Without a page size
 * Chrome's own print dialog lays the page out on its paper setting (e.g. A4) and the printer shrinks it onto the
 * roll, using half its width; the system dialog took the printer's paper. ("80mm auto" isn't valid CSS: the
 * length is measured.) Content wider than a receipt keeps the printer's paper.
 */
export function printOnReceiptPage(printWindow) {
	try {
		const doc = printWindow.document;
		const receipt =
			doc.querySelector(".receipt-container") || doc.querySelector(".print-format") || doc.body;
		const box = receipt.getBoundingClientRect();
		if (box.width / PX_PER_MM <= RECEIPT_MAX_CONTENT_MM && !doc.getElementById("pos-receipt-page")) {
			// Its content's length, not the element's: Frappe's print page has the height of an A4 sheet at least.
			// A little extra: the receipt is a touch wider on paper than on screen, so it may wrap less
			let bottom = box.top;
			for (const child of receipt.children) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
			const contentPx = (bottom > box.top ? bottom - box.top : receipt.scrollHeight) + 16;
			const heightMm = Math.ceil(contentPx / PX_PER_MM) + 6;
			const style = doc.createElement("style");
			style.id = "pos-receipt-page";
			style.textContent = `@page { size: ${RECEIPT_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`;
			doc.head.appendChild(style);
		}
	} catch (error) {
		log.warn("Could not size the receipt page", error);
	}
	printWindow.focus();
	printWindow.print();
}

/**
 * Once the window's page has loaded (and its fonts), print it on a receipt-sized page, then close the window, as
 * Frappe's own trigger_print did (on afterprint, and after 5 seconds where printing doesn't wait, e.g. mobiles).
 * A slow page is waited for as long as the window stays open, up to 2 minutes.
 */
function printWhenLoaded(printWindow) {
	const started = Date.now();
	const tick = async () => {
		if (printWindow.closed) return;
		let ready = false;
		try {
			ready =
				printWindow.location.href !== "about:blank" && printWindow.document.readyState === "complete";
		} catch (error) {
			ready = false;
		}
		if (!ready) {
			if (Date.now() - started < 120000) setTimeout(tick, 150);
			return;
		}
		try {
			await printWindow.document.fonts?.ready;
		} catch (error) {
			// Printed with what has loaded
		}
		const close = () => setTimeout(() => printWindow.closed || printWindow.close(), 300);
		printWindow.addEventListener("afterprint", close, { once: true });
		printOnReceiptPage(printWindow);
		setTimeout(() => printWindow.closed || printWindow.close(), 5000);
	};
	setTimeout(tick, 150);
}

/**
 * Open Frappe's /printview in a new browser window.
 * Printed from here once it has loaded, on a page the size of the receipt (printWhenLoaded).
 * Falls back to the hardcoded receipt template if the popup is blocked.
 */
export async function printInvoice(invoiceData, printFormat = null, letterhead = null) {
	let printWindow = null;
	try {
		if (!invoiceData?.name) throw new Error("Invalid invoice data");

		invoiceData = await hydrateLocalOnlyInvoice(invoiceData);

		// Pending offline / local IDs are not in ERPNext — use embedded receipt HTML.
		if (isLocalOnlyInvoiceName(invoiceData.name)) {
			if (invoiceData.items?.length > 0) return printInvoiceCustom(invoiceData);
			throw new Error(
				__(
					"This offline receipt is no longer in browser storage. Sync the invoice, then print from history."
				)
			);
		}

		const doctype = invoiceData.doctype || "Sales Invoice";
		// Opened now, while the browser still counts the tap that printed (a popup opened after waiting on the
		// server can be blocked); the receipt goes into it once its format is known
		printWindow = window.open("", "_blank", "width=800,height=600");
		if (!printWindow) {
			throw new Error("Popup blocked — check your browser settings.");
		}
		// The POS Profile's print format (e.g. the shop's own receipt), as printInvoiceByName uses, not always the
		// built-in one
		let posProfile = invoiceData.pos_profile;
		if (!posProfile && !printFormat) {
			// A sale from a list (e.g. Invoice History) may not carry it: the saved invoice's
			try {
				// call() returns the server's message itself
				const values = await call("frappe.client.get_value", {
					doctype,
					filters: invoiceData.name,
					fieldname: "pos_profile",
				});
				posProfile = values?.pos_profile;
			} catch (err) {
				log.warn("Could not read the invoice's POS Profile:", err);
			}
		}
		const settings = await resolvePrintSettings(posProfile, printFormat, letterhead);
		const format = settings.printFormat || DEFAULT_PRINT_FORMAT;
		letterhead = settings.letterhead;

		const params = new URLSearchParams({
			doctype,
			name: invoiceData.name,
			format,
			no_letterhead: letterhead ? 0 : 1,
			_lang: "en",
			// Printed from here once loaded (printWhenLoaded), on a page the size of the receipt
			_t: Date.now(),
		});
		if (letterhead) params.append("letterhead", letterhead);

		printWindow.location.href = `/printview?${params}`;
		printWhenLoaded(printWindow);
		return true;
	} catch (error) {
		log.error("Browser print failed:", error);
		// The window opened for the receipt, still blank: not left behind the fallback's
		try {
			if (printWindow && !printWindow.closed && printWindow.location.href === "about:blank") printWindow.close();
		} catch (closeError) {
			// Ignore
		}
		if (isLocalOnlyInvoiceName(invoiceData?.name) && !(invoiceData.items?.length > 0)) {
			throw error;
		}
		return printInvoiceCustom(invoiceData);
	}
}

/**
 * Fetch an invoice by name, resolve its POS Profile print settings,
 * then open the browser print window.
 */
export async function printInvoiceByName(invoiceName, printFormat = null, letterhead = null) {
	if (isLocalOnlyInvoiceName(invoiceName)) {
		const localDoc = await hydrateLocalOnlyInvoice({ name: invoiceName });
		if (!localDoc.items?.length) {
			throw new Error(
				__(
					"This offline receipt is no longer in browser storage. Complete checkout again or sync, then print from history."
				)
			);
		}
		const settings = await resolvePrintSettings(localDoc.pos_profile, printFormat, letterhead);
		return printInvoice(localDoc, settings.printFormat, settings.letterhead);
	}
	const invoiceDoc = await call("pos_next.api.invoices.get_invoice", {
		invoice_name: invoiceName,
	});
	if (!invoiceDoc) throw new Error("Invoice not found");

	const settings = await resolvePrintSettings(invoiceDoc.pos_profile, printFormat, letterhead);
	return printInvoice(invoiceDoc, settings.printFormat, settings.letterhead);
}

// ============================================================================
// Silent printing (QZ Tray — no browser dialog)
// ============================================================================

export async function silentPrintDoc(doctype, name, printFormat) {
	const result = await call("frappe.www.printview.get_html_and_style", {
		doc: doctype,
		name,
		print_format: printFormat,
		no_letterhead: 1,
	});

	const html = result?.html || result?.message?.html;
	const style = result?.style || result?.message?.style || "";
	if (!html) throw new Error("Failed to get print HTML from server");

	const fullHTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${style}</style></head>
<body>${html}</body>
</html>`;

	await qzPrintHTML(fullHTML);
	return true;
}

/**
 * Fetch the server-rendered print HTML and send it to a thermal printer
 * via QZ Tray. Uses Frappe's get_html_and_style API which returns the
 * print format HTML + its inline styles (standard.css, print style, custom CSS).
 * Note: print.bundle.css (Bootstrap grid/tables) is NOT included — print
 * formats that rely on Bootstrap layout classes may render differently.
 * Paper size and margins are controlled by the QZ Tray config in qzTray.js.
 */
export async function silentPrintInvoice(invoiceName, printFormat = null) {
	if (isLocalOnlyInvoiceName(invoiceName)) {
		const doc = await hydrateLocalOnlyInvoice({ name: invoiceName });
		if (doc.items?.length > 0) return silentPrintInvoiceFromDoc(doc);
		throw new Error(
			__(
				"This offline receipt is no longer in browser storage. Use browser print from the success dialog after checkout."
			)
		);
	}
	const format = printFormat || DEFAULT_PRINT_FORMAT;

	await silentPrintDoc("Sales Invoice", invoiceName, format);
	log.info(`Silent print sent for ${invoiceName}`);
	return true;
}

/**
 * Silent-print a full invoice dict using the same HTML as the offline receipt fallback.
 */
export async function silentPrintInvoiceFromDoc(invoiceData) {
	const fullHTML = buildReceiptDocumentHTML(invoiceData, { includeControls: false });
	await qzPrintHTML(fullHTML);
	log.info(`Silent print (local receipt) for ${invoiceData?.name}`);
	flagOfflineInvoicePrinted(invoiceData?.name);
	return true;
}

/**
 * Try silent print, fall back to browser print on failure.
 * silentPrintInvoice → qzPrintHTML → connect() handles auto-reconnect
 * internally, so no separate connection logic is needed here.
 */
export async function printWithSilentFallback(invoiceData, printFormat = null) {
	invoiceData = await hydrateLocalOnlyInvoice(invoiceData);
	const invoiceName = invoiceData?.name;
	if (!invoiceName) throw new Error("Invalid invoice data — missing name");

	if (isLocalOnlyInvoiceName(invoiceName) && invoiceData.items?.length > 0) {
		try {
			await silentPrintInvoiceFromDoc(invoiceData);
			return { method: "silent", success: true };
		} catch (err) {
			log.warn("Silent local receipt failed, falling back to browser:", err?.message || err);
		}
		try {
			printInvoiceCustom(invoiceData);
			return { method: "browser", success: true };
		} catch (err) {
			log.error("Browser print for local receipt failed:", err);
			return { method: "browser", success: false };
		}
	}

	try {
		await silentPrintInvoice(invoiceName, printFormat);
		return { method: "silent", success: true };
	} catch (err) {
		log.warn("Silent print failed, falling back to browser:", err?.message || err);
	}

	try {
		await printInvoiceByName(invoiceName, printFormat);
		return { method: "browser", success: true };
	} catch (err) {
		log.error("Browser print fallback also failed:", err);
		return { method: "browser", success: false };
	}
}

// ============================================================================
// Hardcoded receipt fallback (used only when /printview popup is blocked)
// ============================================================================

/**
 * Renders the receipt locally in a popup window. Used offline, for pending
 * local-only invoices, and as the fallback when /printview is unavailable.
 */
export function printInvoiceCustom(invoiceData) {
	const printWindow = window.open("", "_blank", "width=350,height=600");
	if (!printWindow) {
		log.error("Cannot open print window — popup blocked.");
		throw new Error(__("Popup blocked — check your browser settings."));
	}

	const printContent = buildReceiptDocumentHTML(invoiceData, { includeControls: true });

	printWindow.document.write(printContent);
	printWindow.document.close();
	printWindow.onload = () => {
		setTimeout(() => printOnReceiptPage(printWindow), 250);
	};
	flagOfflineInvoicePrinted(invoiceData?.name);
	return true;
}
