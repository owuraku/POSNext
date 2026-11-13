"""An item's details for the till (the cart's lines, the online shop's orders): what a cashier needs to find it on
the shelf and answer a customer: its name, code, barcodes, picture, group, brand, unit, price and stock in each
warehouse."""

import frappe
from frappe import _
from frappe.utils import flt, strip_html


def _require_till():
	"""A cashier at their open till, or anyone who may read Items."""
	if frappe.has_permission("Item", "read"):
		return
	if frappe.db.exists("POS Opening Shift", {"user": frappe.session.user, "status": "Open", "docstatus": 1}):
		return
	frappe.throw(_("Open your till to see item details."), frappe.PermissionError)


@frappe.whitelist()
def get_item_details(item_code, pos_profile=None):
	_require_till()
	if not item_code or not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item {0} not found.").format(item_code))
	item = frappe.db.get_value(
		"Item",
		item_code,
		["name", "item_name", "item_group", "brand", "stock_uom", "image", "description", "is_stock_item", "disabled"],
		as_dict=True,
	)
	profile = (
		frappe.db.get_value("POS Profile", pos_profile, ["warehouse", "selling_price_list", "currency"], as_dict=True)
		if pos_profile and frappe.db.exists("POS Profile", pos_profile)
		else None
	) or frappe._dict()
	price_list = profile.selling_price_list or frappe.db.get_single_value("Selling Settings", "selling_price_list")
	price = (
		frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list, "selling": 1}, "price_list_rate")
		if price_list
		else None
	)
	stock = frappe.get_all(
		"Bin",
		filters={"item_code": item_code, "actual_qty": ["!=", 0]},
		fields=["warehouse", "actual_qty", "reserved_qty"],
		order_by="actual_qty desc",
	)
	description = strip_html(item.description or "").strip()
	return {
		"item_code": item.name,
		"item_name": item.item_name,
		"item_group": item.item_group,
		"brand": item.brand,
		"uom": item.stock_uom,
		"image": item.image,
		"disabled": bool(item.disabled),
		"description": description[:400] if description != item.item_name else "",
		"barcodes": frappe.get_all("Item Barcode", filters={"parent": item_code, "parenttype": "Item"}, pluck="barcode"),
		"is_stock_item": bool(item.is_stock_item),
		"warehouse": profile.warehouse,
		"stock": [{"warehouse": b.warehouse, "qty": flt(b.actual_qty), "reserved": flt(b.reserved_qty)} for b in stock],
		"price": flt(price),
		"price_list": price_list,
		"currency": profile.currency
		or (price_list and frappe.db.get_value("Price List", price_list, "currency"))
		or frappe.defaults.get_global_default("currency"),
	}
