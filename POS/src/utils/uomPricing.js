/**
 * A unit's price for an item: its own price (uom_prices, from Item Price) when it has one above 0, else the price
 * of one stock unit times the unit's conversion factor (a "Set (Male)" of 6 pieces costs 6 × a piece).
 *
 * A unit without a price of its own came out as 0 in places (the server's answer for it, an Item Price of 0, an
 * item carrying only price_list_rate); a 0 price is never a unit's real price, so it falls back too.
 *
 * @param {Object} item - uom_prices, stock_uom, and the price of its current unit (price_list_rate or rate) with
 *   that unit's conversion_factor
 * @param {string} uom - The unit
 * @param {number} conversionFactor - Stock units in one of that unit
 * @returns {number}
 */
export function uomRate(item, uom, conversionFactor) {
	const own = Number(item?.uom_prices?.[uom]);
	if (own > 0) return own;
	const stockPrice = Number(item?.uom_prices?.[item?.stock_uom]);
	const current = Number(item?.price_list_rate) || Number(item?.rate) || 0;
	const perStockUnit =
		stockPrice > 0 ? stockPrice : current / (Number(item?.conversion_factor) || 1);
	// Without floating-point noise (100 for 3, times 6, is 200, not 199.99999999999997)
	return Math.round(perStockUnit * (Number(conversionFactor) || 1) * 1e6) / 1e6;
}
