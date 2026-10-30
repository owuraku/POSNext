// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/utils/offline/workerClient", () => ({ offlineWorker: {} }))
vi.mock("@/utils/offline/sync", () => ({
	getOfflineInvoiceByOfflineId: vi.fn(),
}))
vi.mock("@/utils/qzTray", () => ({ printHTML: vi.fn() }))

let buildReceiptHTML
beforeAll(async () => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s
	const { setReceiptFooter } = await import("../receiptFooter")
	setReceiptFooter({
		shop_name: "Dianjas Fashion",
		shop_phone: "0557511479",
		shop_email: "shop@example.com",
		cashier: "Kofi Mensah",
		walk_in_customer: "CUST-0001",
		walk_in_customer_name: "Walk-in Customer",
	})
	;({ buildReceiptHTML } = await import("../printInvoice"))
})

const sale = (extra) => ({
	name: "pos_offline_123e4567-e89b-42d3-a456-426614174000",
	is_offline: true,
	currency: "GHS",
	posting_date: "2026-10-30",
	items: [
		{ item_name: "Dress", qty: 2, rate: 150, amount: 300 },
		{ item_name: "Scarf", qty: 1, rate: 1000, amount: 1000 },
	],
	grand_total: 1300,
	payments: [{ mode_of_payment: "Cash", amount: 1300 }],
	...extra,
})

describe("buildReceiptHTML", () => {
	it("prints the shop, cashier and totals, and no Billed To for the walk-in customer", () => {
		const html = buildReceiptHTML(sale({ customer: "CUST-0001" }))
		expect(html).toContain("Dianjas Fashion")
		expect(html).toContain("Tel: 0557511479")
		expect(html).toContain("Kofi Mensah")
		expect(html).toContain("TOTAL PAID")
		expect(html).toContain("GHS 1,300.00")
		expect(html).toContain("Paid via Cash")
		expect(html).not.toContain("Billed To")
	})

	it("names a real customer and shows what a credit sale still owes", () => {
		const html = buildReceiptHTML(
			sale({
				customer: "CUST-1",
				customer_name: "Ama Mensah",
				contact_mobile: "0244111222",
				outstanding_amount: 1000,
				payments: [{ mode_of_payment: "Cash", amount: 300 }],
			}),
		)
		expect(html).toContain("Billed To")
		expect(html).toContain("Ama Mensah")
		expect(html).toContain("Balance Due")
		expect(html).not.toContain("0244111222")
		expect(html).not.toContain("TOTAL PAID")
	})

	it("knows the walk-in customer by name alone, as offline receipts carry it", () => {
		const html = buildReceiptHTML(sale({ customer_name: "Walk-in Customer" }))
		expect(html).not.toContain("Billed To")
	})

	it("escapes names", () => {
		const html = buildReceiptHTML(
			sale({ customer: "X", customer_name: "<img src=x onerror=alert(1)>" }),
		)
		expect(html).not.toContain("<img src=x")
	})
})
