<template>
	<!-- The online shop's orders at the till (the Online Shop app): to follow them up, arrange delivery and move them along -->
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]">
			<div class="fixed inset-0 flex items-center justify-center p-2 sm:p-4" @click.self="show = false">
				<div class="w-full max-w-5xl max-h-[95vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
					<!-- Header -->
					<div class="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-blue-50">
						<div class="flex items-center gap-3 min-w-0">
							<div class="p-2 bg-cyan-100 rounded-lg flex-shrink-0">
								<FeatherIcon name="globe" class="w-6 h-6 text-cyan-700" />
							</div>
							<div class="text-start min-w-0">
								<h2 class="text-lg sm:text-xl font-bold text-gray-900">{{ __("Online Orders") }}</h2>
								<p class="text-xs sm:text-sm text-gray-600 truncate">
									{{ __("Orders from the online shop: follow up, arrange delivery, complete") }}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1 flex-shrink-0">
							<button
								class="w-10 h-10 flex items-center justify-center rounded-md text-gray-600 hover:bg-white"
								:title="__('Refresh')"
								:aria-label="__('Refresh')"
								@click="load()"
							>
								<FeatherIcon name="refresh-cw" :class="['w-5 h-5', loading ? 'animate-spin' : '']" />
							</button>
							<button
								class="w-10 h-10 flex items-center justify-center rounded-md text-gray-600 hover:bg-white"
								:aria-label="__('Close')"
								@click="show = false"
							>
								<FeatherIcon name="x" class="w-5 h-5" />
							</button>
						</div>
					</div>

					<!-- Filters -->
					<div class="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b bg-gray-50">
						<button
							v-for="f in FILTERS"
							:key="f.value"
							:class="[
								'px-3 h-9 rounded-full text-sm font-medium border transition-colors',
								status === f.value
									? 'bg-gray-900 text-white border-gray-900'
									: 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
							]"
							@click="setStatus(f.value)"
						>
							{{ f.label }}
							<span
								v-if="f.count && counts[f.count]"
								class="ms-1 inline-flex min-w-[1.25rem] justify-center rounded-full bg-cyan-600 px-1 text-xs text-white"
							>{{ counts[f.count] }}</span>
						</button>
						<input
							v-model="search"
							type="search"
							:placeholder="__('Order, name or phone')"
							class="ms-auto h-9 w-full sm:w-64 rounded-full border border-gray-200 px-4 text-sm"
							@input="searchSoon"
						/>
					</div>

					<!-- Orders -->
					<div class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-gray-50">
						<div v-if="!enabled && !loading" class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
							{{ __("The online shop is switched off: no new orders come in.") }}
						</div>
						<div v-if="loading && !orders.length" class="py-16 text-center text-gray-500">{{ __("Loading…") }}</div>
						<div v-else-if="!orders.length" class="py-16 text-center text-gray-500">{{ __("No orders here.") }}</div>
						<div v-else class="grid gap-3 md:grid-cols-2">
							<div v-for="o in orders" :key="o.name" class="rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-3">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<div class="font-semibold text-gray-900">{{ o.name }}</div>
										<div class="text-xs text-gray-500">{{ formatWhen(o.creation) }}</div>
									</div>
									<div class="flex flex-wrap justify-end gap-1">
										<span :class="['px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-700']">{{ __(o.status) }}</span>
										<span :class="['px-2 py-0.5 rounded-full text-xs font-semibold', PAYMENT_STYLE[o.payment_state] || 'bg-gray-100 text-gray-700']">{{ o.payment_text }}</span>
										<span
											v-if="o.online_fulfilment"
											:class="['px-2 py-0.5 rounded-full text-xs font-semibold', o.online_fulfilment === 'Pickup' ? 'bg-purple-100 text-purple-800' : 'bg-cyan-100 text-cyan-800']"
										>{{ __(o.online_fulfilment) }}</span>
									</div>
								</div>

								<div class="flex items-center justify-between gap-2">
									<div class="min-w-0">
										<div class="font-medium text-gray-900 truncate" dir="auto">{{ o.online_customer_name || o.customer_name }}</div>
										<div class="text-sm text-gray-600" dir="ltr">{{ o.online_customer_phone }}</div>
									</div>
									<div v-if="o.online_customer_phone" class="flex gap-1 flex-shrink-0">
										<a
											:href="`tel:${o.online_customer_phone}`"
											class="h-9 px-3 inline-flex items-center gap-1 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
										><FeatherIcon name="phone" class="w-4 h-4" />{{ __("Call") }}</a>
										<a
											:href="whatsapp(o.online_customer_phone)"
											target="_blank"
											rel="noopener"
											class="h-9 px-3 inline-flex items-center gap-1 rounded-md border border-green-200 text-sm text-green-700 hover:bg-green-50"
										><FeatherIcon name="message-circle" class="w-4 h-4" />WhatsApp</a>
									</div>
								</div>

								<div v-if="o.online_delivery_note" class="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-line" dir="auto">
									<span class="font-medium">{{ o.online_fulfilment === "Pickup" ? __("Pickup") : __("Delivery") }}:</span> {{ plain(o.online_delivery_note) }}
								</div>

								<div class="text-sm divide-y divide-gray-100">
									<button
										v-for="(i, idx) in o.items"
										:key="idx"
										class="w-full flex justify-between gap-3 py-1.5 text-start hover:bg-cyan-50 rounded px-1 -mx-1"
										:title="__('See the item')"
										@click="openItem(i.item_code)"
									>
										<span class="min-w-0 truncate"><span class="tabular-nums">{{ qty(i.qty) }} ×</span> <span class="text-cyan-800 underline decoration-dotted">{{ i.item_name }}</span></span>
										<span class="tabular-nums text-gray-700">{{ money(i.amount) }}</span>
									</button>
									<div class="flex justify-between pt-2 font-semibold">
										<span>{{ __("Total") }}</span><span class="tabular-nums">{{ money(o.total) }}</span>
									</div>
								</div>

								<div v-if="o.invoice" class="text-xs text-gray-500">{{ __("Invoice") }} {{ o.invoice }}</div>

								<div v-if="OPEN.includes(o.status)" class="flex flex-wrap gap-2">
									<Button v-if="o.status === 'New'" variant="solid" :loading="busy === o.name" @click="move(o, 'Confirmed')">{{ __("Confirm") }}</Button>
									<Button v-if="o.status === 'Confirmed'" variant="solid" :loading="busy === o.name" @click="move(o, 'Ready')">{{ __("Ready") }}</Button>
									<Button :variant="o.status === 'Ready' ? 'solid' : 'subtle'" :loading="busy === o.name" @click="askComplete(o)">{{ __("Complete") }}</Button>
									<Button variant="ghost" theme="red" :loading="busy === o.name" @click="askCancel(o)">{{ __("Cancel") }}</Button>
								</div>
							</div>
						</div>
						<div v-if="more" class="mt-4 text-center">
							<Button :loading="loading" @click="load(true)">{{ __("Load more") }}</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>

	<!-- Complete: the invoice is made and the stock goes out; for an order not paid yet, the payment taken now -->
	<Dialog v-model="completing.show" :options="{ title: __('Complete Order {0}', [completing.order?.name || '']), size: 'md' }">
		<template #body-content>
			<p class="text-sm text-gray-700 mb-3">{{ __("The customer has their goods: an invoice is made and the stock goes out.") }}</p>
			<template v-if="completing.order && completing.order.payment_state !== 'paid'">
				<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Payment received by") }}</label>
				<select v-model="completing.mode" class="w-full h-10 rounded-md border border-gray-300 px-3 text-sm">
					<option v-for="m in modes" :key="m" :value="m">{{ m }}</option>
					<option value="">{{ __("Not paid yet (the invoice stays unpaid)") }}</option>
				</select>
				<p class="text-xs text-gray-500 mt-1">{{ __("Amount: {0}", [money(completing.order.total)]) }}</p>
			</template>
			<p v-else class="text-sm text-green-700">{{ __("Already paid online.") }}</p>
		</template>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button @click="completing.show = false">{{ __("Back") }}</Button>
				<Button variant="solid" :loading="busy === completing.order?.name" @click="complete">{{ __("Complete") }}</Button>
			</div>
		</template>
	</Dialog>

	<!-- Cancel -->
	<Dialog v-model="cancelling.show" :options="{ title: __('Cancel Order {0}?', [cancelling.order?.name || '']), size: 'sm' }">
		<template #body-content>
			<p class="text-sm text-gray-700">{{ __("Its stock is freed. A payment already taken stays on the customer's account, to refund or use.") }}</p>
		</template>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button @click="cancelling.show = false">{{ __("Back") }}</Button>
				<Button variant="solid" theme="red" :loading="busy === cancelling.order?.name" @click="cancel">{{ __("Cancel Order") }}</Button>
			</div>
		</template>
	</Dialog>

	<!-- An item's details: to find it on the shelf (the online shop's warehouse pointed out) -->
	<ItemDetailsDialog
		v-model="itemDialog.show"
		:item-code="itemDialog.code"
		:pos-profile="posProfile"
		:highlight-warehouse="shopWarehouse"
		:highlight-label="__('online shop')"
	/>
</template>

<script setup>
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"
import { DEFAULT_CURRENCY, formatCurrency as formatCurrencyUtil } from "@/utils/currency"
import { Button, Dialog, FeatherIcon } from "frappe-ui"
import ItemDetailsDialog from "./ItemDetailsDialog.vue"
import { reactive, ref, watch } from "vue"

const props = defineProps({
	modelValue: Boolean,
	currency: { type: String, default: DEFAULT_CURRENCY },
	posProfile: String,
})
const emit = defineEmits(["update:modelValue"])
const { showSuccess, showError } = useToast()

const API = "online_shop.pos"
const OPEN = ["New", "Confirmed", "Ready"]
const FILTERS = [
	{ value: "open", label: __("Open"), count: "open" },
	{ value: "Awaiting Payment", label: __("Awaiting payment") },
	{ value: "Completed", label: __("Completed") },
	{ value: "Cancelled", label: __("Cancelled") },
	{ value: "all", label: __("All") },
]
const STATUS_STYLE = {
	New: "bg-blue-100 text-blue-800",
	Confirmed: "bg-orange-100 text-orange-800",
	Ready: "bg-green-100 text-green-800",
	Completed: "bg-gray-100 text-gray-700",
	Cancelled: "bg-red-100 text-red-700",
	"Awaiting Payment": "bg-yellow-100 text-yellow-800",
}
const PAYMENT_STYLE = {
	paid: "bg-green-100 text-green-800",
	unpaid: "bg-orange-100 text-orange-800",
	awaiting: "bg-yellow-100 text-yellow-800",
	credit: "bg-blue-100 text-blue-800",
	none: "bg-gray-100 text-gray-600",
}

const show = ref(props.modelValue)
const orders = ref([])
const counts = ref({})
const more = ref(false)
const enabled = ref(true)
const modes = ref([])
const status = ref("open")
const search = ref("")
const loading = ref(false)
const busy = ref(null)
const completing = reactive({ show: false, order: null, mode: "" })
const cancelling = reactive({ show: false, order: null })
const itemDialog = reactive({ show: false, code: null })
const shopWarehouse = ref(null)

watch(() => props.modelValue, (value) => (show.value = value))
watch(show, (value) => {
	emit("update:modelValue", value)
	if (value) {
		load()
		loadModes()
	}
})

const money = (value, currency) => formatCurrencyUtil(Number.parseFloat(value || 0), currency || props.currency)
const qty = (value) => {
	const n = Number(value || 0)
	return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
// Frappe keeps typed text HTML-escaped (& as &amp;): shown as typed
const plain = (text) => new DOMParser().parseFromString(text || "", "text/html").documentElement.textContent
function formatWhen(value) {
	const date = new Date(String(value).replace(" ", "T"))
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
// A Ghana number (024…) as WhatsApp wants it (23324…)
function whatsapp(phone) {
	let digits = String(phone || "").replace(/\D/g, "")
	if (digits.startsWith("0")) digits = `233${digits.slice(1)}`
	return `https://wa.me/${digits}`
}

// Loads overlap (a filter picked, an action done): only the latest one draws
let latest = 0
async function load(append = false) {
	const run = ++latest
	loading.value = true
	try {
		const result = await call(`${API}.get_orders`, {
			status: status.value,
			search: search.value || null,
			start: append ? orders.value.length : 0,
		})
		if (run !== latest) return
		const shown = new Set(append ? orders.value.map((o) => o.name) : [])
		orders.value = append ? orders.value.concat(result.orders.filter((o) => !shown.has(o.name))) : result.orders
		more.value = result.more
		enabled.value = result.enabled
		const c = result.counts || {}
		counts.value = { open: (c.New || 0) + (c.Confirmed || 0) + (c.Ready || 0) }
	} catch (error) {
		if (run === latest) showError(error?.message || __("The online orders couldn't be loaded."))
	} finally {
		if (run === latest) loading.value = false
	}
}

async function loadModes() {
	try {
		const result = await call(`${API}.available`)
		modes.value = result.modes || []
		shopWarehouse.value = result.warehouse || null
	} catch (error) {
		modes.value = []
	}
}

function setStatus(value) {
	status.value = value
	load()
}

let searchTimer
function searchSoon() {
	clearTimeout(searchTimer)
	searchTimer = setTimeout(() => load(), 350)
}

async function act(order, method, args, message) {
	busy.value = order.name
	try {
		const result = await call(`${API}.${method}`, { name: order.name, ...args })
		showSuccess(typeof message === "function" ? message(result) : message)
		await load()
		return true
	} catch (error) {
		showError(error?.message || __("That didn't work. Please try again."))
		return false
	} finally {
		busy.value = null
	}
}

function move(order, next) {
	act(order, "set_status", { status: next }, __("Order {0}: {1}", [order.name, __(next)]))
}

function askComplete(order) {
	completing.order = order
	completing.mode = modes.value[0] || ""
	completing.show = true
}

async function complete() {
	const order = completing.order
	const paid = order.payment_state === "paid"
	const done = await act(order, "complete", { mode_of_payment: paid ? null : completing.mode || null }, (result) =>
		__("Order {0} completed: invoice {1}", [order.name, result.invoice]),
	)
	if (done) completing.show = false
}

function askCancel(order) {
	cancelling.order = order
	cancelling.show = true
}

async function cancel() {
	const done = await act(cancelling.order, "cancel", {}, __("Order {0} cancelled", [cancelling.order.name]))
	if (done) cancelling.show = false
}

function openItem(itemCode) {
	if (!itemCode) return
	itemDialog.code = itemCode
	itemDialog.show = true
}
</script>
