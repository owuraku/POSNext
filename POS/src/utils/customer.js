/**
 * How the POS shows a customer: "Kofi Mensah (0241234567)", or just the name when there is no number.
 * @param {object|string} customer - Customer record (customer_name, name, mobile_no) or a customer ID
 */
export function customerLabel(customer) {
	if (!customer) return ""
	if (typeof customer === "string") return customer
	const name = customer.customer_name || customer.name || ""
	return customer.mobile_no ? `${name} (${customer.mobile_no})` : name
}
