<template>
	<Dialog v-model="open" :options="{ title: __('Shift Payments'), size: '3xl' }">
		<template #body-content>
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between gap-2">
					<p class="text-sm text-gray-500">
						{{ __("Payments taken in this shift, newest first.") }}
					</p>
					<Button size="sm" :loading="resource.loading" @click="load">
						<template #prefix><FeatherIcon name="refresh-cw" class="w-4 h-4" /></template>
						{{ __("Refresh") }}
					</Button>
				</div>

				<div v-if="resource.error" class="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
					{{ __("Couldn't load the payments. Check your connection and try again.") }}
				</div>

				<div v-if="!data && resource.loading" class="py-10 text-center text-gray-500 text-sm">
					{{ __("Loading payments...") }}
				</div>

				<template v-if="data">
					<!-- Summary -->
					<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
						<div
							v-for="card in cards"
							:key="card.key"
							class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
						>
							<div class="flex items-center justify-between">
								<span class="text-xs font-medium text-gray-500">{{ card.label }}</span>
								<span :class="['w-7 h-7 rounded-lg flex items-center justify-center', card.tint]">
									<FeatherIcon :name="card.icon" class="w-4 h-4" />
								</span>
							</div>
							<div class="mt-1 text-lg font-bold text-gray-900">{{ money(card.value) }}</div>
							<div class="text-xs text-gray-500">{{ card.note }}</div>
						</div>
					</div>

					<!-- Cash vs online -->
					<div v-if="data.summary.total > 0">
						<div class="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
							<div class="bg-emerald-500" :style="{ width: `${cashShare}%` }"></div>
							<div class="bg-blue-500" :style="{ width: `${100 - cashShare}%` }"></div>
						</div>
						<div class="mt-1 flex justify-between text-xs text-gray-500">
							<span>{{ __("Cash {0}%", [cashShare]) }}</span>
							<span>{{ __("Online {0}%", [100 - cashShare]) }}</span>
						</div>
					</div>

					<!-- By method -->
					<div class="rounded-xl border border-gray-200 overflow-hidden">
						<table class="w-full text-sm">
							<thead class="bg-gray-50 text-gray-600">
								<tr>
									<th class="text-start px-3 py-2 font-medium">{{ __("Method") }}</th>
									<th class="text-end px-3 py-2 font-medium">{{ __("Payments") }}</th>
									<th class="text-end px-3 py-2 font-medium">{{ __("Amount") }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-if="!data.by_mode.length">
									<td colspan="3" class="px-3 py-4 text-center text-gray-500">
										{{ __("No payments yet in this shift.") }}
									</td>
								</tr>
								<tr v-for="mode in data.by_mode" :key="mode.mode_of_payment" class="border-t border-gray-100">
									<td class="px-3 py-2">
										<span class="inline-flex items-center gap-2">
											<span :class="['w-2 h-2 rounded-full', isCash(mode) ? 'bg-emerald-500' : 'bg-blue-500']"></span>
											{{ mode.mode_of_payment }}
										</span>
									</td>
									<td class="px-3 py-2 text-end">{{ mode.count }}</td>
									<td class="px-3 py-2 text-end font-semibold">{{ money(mode.amount) }}</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- Payments -->
					<div class="flex items-center gap-2">
						<button
							v-for="option in filters"
							:key="option.value"
							type="button"
							@click="filter = option.value"
							:class="[
								'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
								filter === option.value
									? 'bg-gray-900 border-gray-900 text-white'
									: 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
							]"
						>
							{{ option.label }}
						</button>
					</div>
					<div class="rounded-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
						<table class="w-full text-sm">
							<thead class="bg-gray-50 text-gray-600 sticky top-0">
								<tr>
									<th class="text-start px-3 py-2 font-medium">{{ __("Time") }}</th>
									<th class="text-start px-3 py-2 font-medium">{{ __("Customer") }}</th>
									<th class="text-start px-3 py-2 font-medium">{{ __("Method") }}</th>
									<th class="text-end px-3 py-2 font-medium">{{ __("Amount") }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-if="!visiblePayments.length">
									<td colspan="4" class="px-3 py-4 text-center text-gray-500">
										{{ __("No payments to show.") }}
									</td>
								</tr>
								<tr
									v-for="(pay, idx) in visiblePayments"
									:key="`${pay.invoice || pay.payment_entry}-${idx}`"
									class="border-t border-gray-100"
								>
									<td class="px-3 py-2 whitespace-nowrap">
										<div>{{ timeOf(pay.time) }}</div>
										<div class="text-xs text-gray-400">{{ pay.invoice || pay.payment_entry }}</div>
									</td>
									<td class="px-3 py-2">
										{{ pay.customer_name || pay.customer }}
										<span
											v-if="pay.is_return"
											class="ms-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600"
										>{{ __("Return") }}</span>
										<span
											v-if="pay.payment_entry"
											class="ms-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700"
										>{{ __("Debt paid") }}</span>
									</td>
									<td class="px-3 py-2">{{ pay.mode_of_payment }}</td>
									<td :class="['px-3 py-2 text-end font-semibold', pay.amount < 0 ? 'text-red-600' : 'text-gray-900']">
										{{ money(pay.amount) }}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</template>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { formatCurrency } from "@/utils/currency";
import { Button, Dialog, FeatherIcon, createResource } from "frappe-ui";
import { computed, ref, watch } from "vue";

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	openingShift: { type: String, default: null },
	currency: { type: String, default: null },
});

const emit = defineEmits(["update:modelValue"]);

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

const data = ref(null);
const filter = ref("all");

const resource = createResource({
	url: "pos_next.api.shifts.get_shift_payments",
	makeParams() {
		return { opening_shift: props.openingShift };
	},
	auto: false,
	onSuccess(result) {
		data.value = result;
	},
});

function load() {
	if (props.openingShift) resource.fetch();
}

watch(open, (isOpen) => {
	if (isOpen) load();
});

// A new shift: don't show the previous shift's payments while loading
watch(
	() => props.openingShift,
	() => {
		data.value = null;
	},
);

const filters = [
	{ value: "all", label: __("All") },
	{ value: "cash", label: __("Cash") },
	{ value: "online", label: __("Online") },
];

const isCash = (row) => row.type === "Cash";

const visiblePayments = computed(() => {
	const payments = data.value?.payments || [];
	if (filter.value === "cash") return payments.filter(isCash);
	if (filter.value === "online") return payments.filter((p) => !isCash(p));
	return payments;
});

const cashShare = computed(() => {
	const s = data.value?.summary;
	const total = Math.abs(s?.cash || 0) + Math.abs(s?.online || 0);
	return total ? Math.round((Math.abs(s.cash) / total) * 100) : 0;
});

const cards = computed(() => {
	const s = data.value?.summary || {};
	const count = (type) => (data.value?.payments || []).filter((p) => (type === "Cash") === isCash(p)).length;
	return [
		{ key: "cash", label: __("Cash"), value: s.cash, icon: "dollar-sign", tint: "bg-emerald-100 text-emerald-700", note: __("{0} payments", [count("Cash")]) },
		{ key: "online", label: __("Online"), value: s.online, icon: "smartphone", tint: "bg-blue-100 text-blue-700", note: __("{0} payments", [count("Online")]) },
		{ key: "on_account", label: __("On Account"), value: s.on_account, icon: "clock", tint: "bg-amber-100 text-amber-700", note: __("Still owed by customers") },
		{ key: "total", label: __("Total Taken"), value: s.total, icon: "credit-card", tint: "bg-gray-100 text-gray-700", note: __("{0} sales", [s.invoices || 0]) },
	];
});

function money(amount) {
	return formatCurrency(Number(amount) || 0, data.value?.currency || props.currency || undefined);
}

function timeOf(value) {
	// "2026-10-26 14:05:09" -> "14:05"; a Payment Entry has only a date
	const time = String(value || "").split(" ")[1];
	return time ? time.slice(0, 5) : value;
}
</script>
