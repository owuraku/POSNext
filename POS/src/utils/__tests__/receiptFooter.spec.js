// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { receiptFooterHTML, setReceiptFooter } from "../receiptFooter"

const OFFLINE_ID = "pos_offline_123e4567-e89b-42d3-a456-426614174000"

describe("receiptFooterHTML", () => {
	beforeEach(() => localStorage.clear())

	it("adds nothing without a footer from the server", () => {
		expect(receiptFooterHTML({ name: OFFLINE_ID })).toBe("")
	})

	it("puts a QR code linking to the offline id, and the tagline, on an offline receipt", () => {
		setReceiptFooter({
			verify_url: "https://shop.example/verify-receipt",
			tagline: "Powered by SHOMMEY",
		})
		const html = receiptFooterHTML({ name: OFFLINE_ID }, "Scan to verify")
		expect(html).toContain("<svg")
		expect(html).toContain("Scan to verify")
		expect(html).toContain("Powered by SHOMMEY")
	})

	it("leaves the QR code off a synced invoice and an id that isn't a random offline id", () => {
		setReceiptFooter({
			verify_url: "https://shop.example/verify-receipt",
			tagline: "Powered by SHOMMEY",
		})
		for (const name of ["ACC-SINV-2026-00001", "pos_offline_1730000000000"]) {
			const html = receiptFooterHTML({ name })
			expect(html).not.toContain("<svg")
			expect(html).toContain("Powered by SHOMMEY")
		}
	})

	it("escapes the tagline and forgets a footer the server no longer sends", () => {
		setReceiptFooter({ verify_url: null, tagline: "<b>x</b>" })
		expect(receiptFooterHTML({ name: OFFLINE_ID })).toContain(
			"&lt;b&gt;x&lt;/b&gt;",
		)
		setReceiptFooter({ verify_url: null, tagline: null })
		expect(receiptFooterHTML({ name: OFFLINE_ID })).toBe("")
	})
})
