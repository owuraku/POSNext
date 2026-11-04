<template>
	<div
		v-if="modelValue"
		class="pointer-events-auto fixed inset-0 z-[var(--z-authorization)] flex items-center justify-center bg-black/50 p-4"
		@pointerdown.stop
	>
		<FocusScope trapped as-child>
			<form
				class="w-full max-w-sm rounded-xl bg-white shadow-xl dark:bg-gray-800"
				@submit.prevent="save"
			>
				<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
						{{ hasPin ? __("Change Your PIN") : __("Set Your PIN") }}
					</h3>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{{
							__(
								"Unlocks the POS when the screen is locked. {0} digits; not a run like 1234 or 1111.",
								[length],
							)
						}}
					</p>
				</div>

				<div class="space-y-3 px-5 py-4">
					<label
						v-if="hasPin"
						class="block text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						{{ __("Current PIN") }}
						<input
							ref="firstInputRef"
							v-model="current"
							type="password"
							inputmode="numeric"
							autocomplete="off"
							:maxlength="length"
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
							@input="current = digits(current)"
						/>
					</label>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						{{ __("New PIN") }}
						<input
							:ref="hasPin ? undefined : 'firstInputRef'"
							v-model="next"
							type="password"
							inputmode="numeric"
							autocomplete="off"
							:maxlength="length"
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
							@input="next = digits(next)"
						/>
					</label>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						{{ __("Confirm New PIN") }}
						<input
							v-model="confirm"
							type="password"
							inputmode="numeric"
							autocomplete="off"
							:maxlength="length"
							class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
							@input="confirm = digits(confirm)"
						/>
					</label>
					<p v-if="error" class="text-sm text-red-600">{{ error }}</p>
				</div>

				<div
					class="flex justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700"
				>
					<button
						type="button"
						class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
						:disabled="saving"
						@click="close"
					>
						{{ __("Cancel") }}
					</button>
					<button
						type="submit"
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
						:disabled="saving"
					>
						{{ saving ? __("Saving...") : __("Save PIN") }}
					</button>
				</div>
			</form>
		</FocusScope>
	</div>
</template>

<script setup>
/**
 * Set or change the user's own PIN (their POS authorization PIN, which also unlocks the locked screen).
 * POS Next's own rules apply (pos_next.api.authorization.set_authorization_pin): its length, digits only, no
 * easy runs, and the current PIN to change it.
 */
import { useSessionLock } from "@/composables/useSessionLock";
import { useToast } from "@/composables/useToast";
import { call } from "@/utils/apiWrapper";
import { userData } from "@/data/user";
import { FocusScope } from "reka-ui";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({ modelValue: { type: Boolean, default: false } });
const emit = defineEmits(["update:modelValue"]);

const { pinInfo, setPinInfo, cachePinHash } = useSessionLock();
const { showSuccess } = useToast();

const hasPin = computed(() => pinInfo.value.hasPin);
const length = computed(() => pinInfo.value.length);
const current = ref("");
const next = ref("");
const confirm = ref("");
const error = ref("");
const saving = ref(false);
const firstInputRef = ref(null);

const digits = (value) =>
	String(value || "")
		.replace(/\D/g, "")
		.slice(0, length.value);

// Escape closes it wherever the focus is (it falls to the page while Save is disabled)
function onKeydown(event) {
	if (event.key !== "Escape") return;
	event.preventDefault();
	event.stopPropagation();
	close();
}

watch(
	() => props.modelValue,
	async (open) => {
		if (!open) {
			window.removeEventListener("keydown", onKeydown, true);
			return;
		}
		window.addEventListener("keydown", onKeydown, true);
		current.value = next.value = confirm.value = error.value = "";
		await nextTick();
		firstInputRef.value?.focus();
	},
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));

function close() {
	if (!saving.value) emit("update:modelValue", false);
}

async function save() {
	error.value = "";
	if (hasPin.value && current.value.length !== length.value) {
		error.value = __("Enter your current PIN.");
		return;
	}
	if (next.value.length !== length.value) {
		error.value = __("The PIN must be exactly {0} digits.", [length.value]);
		return;
	}
	if (next.value !== confirm.value) {
		error.value = __("The two new PINs don't match.");
		return;
	}
	saving.value = true;
	try {
		const res = await call("pos_next.api.authorization.set_authorization_pin", {
			user: userData.userId || window.frappe?.session?.user,
			new_pin: next.value,
			current_pin: hasPin.value ? current.value : null,
		});
		// call() already unwraps Frappe's {message}; the result's own message is the reason it failed
		const data =
			res && typeof res.message === "object" && res.message !== null ? res.message : res;
		if (!data?.success) {
			error.value = data?.message || __("Could not save the PIN.");
			return;
		}
		setPinInfo({ has_pin: true, length: length.value });
		// So the screen can be unlocked with it offline too
		await cachePinHash(next.value);
		showSuccess(__("PIN saved. Use it to unlock the screen."));
		emit("update:modelValue", false);
	} catch (e) {
		error.value = e?.messages?.[0] || e?.message || __("Could not save the PIN.");
	} finally {
		saving.value = false;
		if (error.value) {
			await nextTick();
			firstInputRef.value?.focus();
		}
	}
}
</script>
