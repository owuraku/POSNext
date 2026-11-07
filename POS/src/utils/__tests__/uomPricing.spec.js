import { describe, expect, it } from "vitest"
import { uomRate } from "@/utils/uomPricing"

const piece = { stock_uom: "Piece", uom: "Piece", conversion_factor: 1, price_list_rate: 50, rate: 50 }

describe("uomRate", () => {
	it("uses the unit's own price when it has one", () => {
		expect(uomRate({ ...piece, uom_prices: { Piece: 50, "Set (Male)": 280 } }, "Set (Male)", 6)).toBe(280)
	})

	it("is a stock unit's price times the conversion factor without one", () => {
		expect(uomRate({ ...piece, uom_prices: { Piece: 50 } }, "Set (Male)", 6)).toBe(300)
		expect(uomRate({ ...piece, uom_prices: { Piece: 50 } }, "Set (Female)", 3)).toBe(150)
	})

	it("takes a unit's price of 0 as no price", () => {
		expect(uomRate({ ...piece, uom_prices: { Piece: 50, "Set (Male)": 0 } }, "Set (Male)", 6)).toBe(300)
	})

	it("works from price_list_rate when rate is missing (no prices map)", () => {
		expect(uomRate({ stock_uom: "Piece", conversion_factor: 1, price_list_rate: 50 }, "Set (Male)", 6)).toBe(300)
	})

	it("works from the price of the item's current unit (a set back to pieces)", () => {
		const set = { stock_uom: "Piece", uom: "Set (Male)", conversion_factor: 6, price_list_rate: 300, rate: 300 }
		expect(uomRate(set, "Piece", 1)).toBe(50)
		expect(uomRate(set, "Set (Female)", 3)).toBe(150)
	})
})
