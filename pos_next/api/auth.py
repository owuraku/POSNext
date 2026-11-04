import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils.password import check_password


@frappe.whitelist()
@rate_limit(limit=5, seconds=60)
def verify_session_password(password=None):
	"""Verify the current session user's password for session lock re-authentication.

	NOTE: We must NOT raise frappe.AuthenticationError here because Frappe's
	error handler (app.py) calls login_manager.clear_cookies() for that
	exception type, which would destroy the user's session on a wrong password.
	Instead, we return a structured response indicating success or failure.
	"""
	if not password:
		return {"verified": False, "message": _("Password is required")}

	try:
		check_password(frappe.session.user, password)
		return {"verified": True}
	except frappe.AuthenticationError:
		return {"verified": False, "message": _("Incorrect password")}


@frappe.whitelist()
@rate_limit(limit=10, seconds=60)
def verify_session_pin(pin=None):
	"""Verify the session user's PIN (their POS authorization PIN) to unlock the locked screen.

	The PIN's own lockout applies: too many wrong PINs and it's refused for a while, wrong or right, so a
	locked till can't be guessed open. As verify_session_password, never raises AuthenticationError (which
	would end the session).
	"""
	from pos_next.authorization import pin as pin_store

	user = frappe.session.user
	if not pin:
		return {"verified": False, "message": _("PIN is required")}
	if not pin_store.has_pin(user):
		return {"verified": False, "no_pin": True, "message": _("You have no PIN yet. Unlock with your password.")}
	if pin_store.is_locked_out(user):
		return {
			"verified": False,
			"message": _("Too many wrong PINs. Try again in {0} minutes, or unlock with your password.").format(
				pin_store.lockout_seconds() // 60
			),
		}
	if not pin_store.verify(user, str(pin)):
		pin_store.register_failure(user)
		return {"verified": False, "message": _("Incorrect PIN")}
	pin_store.clear_failures(user)
	return {"verified": True}
