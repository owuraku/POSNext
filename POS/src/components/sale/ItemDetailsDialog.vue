<template>
	<!-- An item's details, to find it on the shelf: picture, code, barcodes, group, unit, price, stock by warehouse -->
	<Dialog v-model="show" :options="{ title: item?.item_name || __('Item'), size: 'lg' }">
		<template #body-content>
			<div v-if="loading" class="py-10 text-center text-gray-500">{{ __("Loading…") }}</div>
			<div v-else-if="item" class="flex flex-col sm:flex-row gap-4">
				<div class="w-full sm:w-48 h-48 flex-shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
					<img v-if="item.image" :src="item.image" :alt="item.item_name" class="w-full h-full object-cover" />
					<FeatherIcon v-else name="image" class="w-10 h-10 text-gray-300" />
				</div>
				<div class="flex-1 min-w-0 text-sm">
					<p v-if="item.disabled" class="mb-2 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{{ __("This item is disabled") }}</p>
					<dl class="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
						<dt class="text-gray-500">{{ __("Item Code") }}</dt>
						<dd class="font-mono font-semibold break-all">{{ item.item_code }}</dd>
						<template v-if="item.barcodes.length">
							<dt class="text-gray-500">{{ __("Barcode") }}</dt>
							<dd class="font-mono break-all">{{ item.barcodes.join(", ") }}</dd>
						</template>
						<dt class="text-gray-500">{{ __("Group") }}</dt>
						<dd>{{ item.item_group }}</dd>
						<template v-if="item.brand">
							<dt class="text-gray-500">{{ __("Brand") }}</dt>
							<dd>{{ item.brand }}</dd>
						</template>
						<dt class="text-gray-500">{{ __("Unit") }}</dt>
						<dd>{{ item.uom }}</dd>
						<template v-if="item.price">
							<dt class="text-gray-500">{{ __("Price") }}</dt>
							<dd class="font-semibold">{{ money(item.price, item.currency) }}</dd>
						</template>
					</dl>
					<p v-if="item.description" class="mt-3 text-gray-600" dir="auto">{{ item.description }}</p>
					<div v-if="item.is_stock_item" class="mt-4">
						<div class="font-medium text-gray-900 mb-1">{{ __("In stock") }}</div>
						<div v-if="!item.stock.length" class="text-red-600">{{ __("None in any warehouse") }}</div>
						<div
							v-for="s in item.stock"
							:key="s.warehouse"
							:class="['flex justify-between gap-3 rounded px-2 py-1', marked(s.warehouse) ? 'bg-cyan-50 font-semibold' : '']"
						>
							<span class="min-w-0 break-words">
								{{ s.warehouse }}<span v-if="marked(s.warehouse)" class="text-xs text-cyan-700"> · {{ markLabel }}</span>
							</span>
							<span class="tabular-nums flex-shrink-0 text-end">
								{{ qty(s.qty) }}<span v-if="s.reserved" class="text-xs text-gray-500"> ({{ __("{0} reserved", [qty(s.reserved)]) }})</span>
							</span>
						</div>
					</div>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"
import { formatCurrency as formatCurrencyUtil } from "@/utils/currency"
import { Dialog, FeatherIcon } from "frappe-ui"
import { computed, ref, watch } from "vue"

const props = defineProps({
	modelValue: Boolean,
	itemCode: String,
	posProfile: String,
	// A warehouse to point out (the till's own, or the online shop's), and what to call it
	highlightWarehouse: String,
	highlightLabel: String,
})
const emit = defineEmits(["update:modelValue"])
const { showError } = useToast()

const show = ref(props.modelValue)
const item = ref(null)
const loading = ref(false)

watch(() => props.modelValue, (value) => (show.value = value))
watch(show, (value) => {
	emit("update:modelValue", value)
	if (value) load()
})
watch(() => props.itemCode, () => show.value && load())

const markWarehouse = computed(() => props.highlightWarehouse || item.value?.warehouse)
const markLabel = computed(() => props.highlightLabel || __("this till"))
const marked = (warehouse) => warehouse && warehouse === markWarehouse.value
const money = (value, currency) => formatCurrencyUtil(Number.parseFloat(value || 0), currency)
const qty = (value) => {
	const n = Number(value || 0)
	return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

let latest = 0
async function load() {
	if (!props.itemCode) return
	const run = ++latest
	item.value = null
	loading.value = true
	try {
		const result = await call("pos_next.api.item_info.get_item_details", {
			item_code: props.itemCode,
			pos_profile: props.posProfile || null,
		})
		if (run === latest) item.value = result
	} catch (error) {
		if (run !== latest) return
		show.value = false
		showError(error?.message || __("The item couldn't be loaded."))
	} finally {
		if (run === latest) loading.value = false
	}
}
</script>
