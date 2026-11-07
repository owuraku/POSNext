<template>
	<Teleport to="body">
		<Transition name="lock-overlay">
			<!-- Above every other layer and usable over an open dialog: the dialog turns pointer events off for the
			     rest of the page (pointer-events-auto turns them back on here), keeps focus inside itself (the
			     FocusScope below takes it while locked), and closes on a press outside or Escape (stopped here,
			     with the POS's own shortcuts) -->
			<div
				v-if="isLocked"
				class="pointer-events-auto fixed inset-0 z-[var(--z-session-lock)] flex items-center justify-center"
				@pointerdown.stop
				@keydown.stop
			>
				<!-- Backdrop -->
				<div class="absolute inset-0 bg-black/70 backdrop-blur-md"></div>

				<!-- Lock Card -->
				<FocusScope trapped as-child>
					<div class="relative z-10 w-full max-w-sm mx-4">
						<div class="bg-white rounded-2xl shadow-2xl p-8">
							<!-- Lock Icon -->
							<div class="flex justify-center mb-5">
								<div
									class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center"
								>
									<FeatherIcon
										name="lock"
										class="w-8 h-8 text-amber-600"
										:stroke-width="2"
									/>
								</div>
							</div>

							<!-- User Info -->
							<div class="text-center mb-6">
								<!-- Avatar -->
								<div class="flex justify-center mb-3">
									<img
										v-if="lockedUser?.image"
										:src="lockedUser.image"
										:alt="lockedUser.name"
										class="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
									/>
									<div
										v-else
										class="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg border-2 border-blue-500"
									>
										{{ lockedUser?.initials || "??" }}
									</div>
								</div>
								<h3 class="text-lg font-bold text-gray-900">
									{{ lockedUser?.name || __("User") }}
								</h3>
								<p class="text-sm text-gray-500 mt-1">
									{{ __("Session Locked") }}
								</p>
								<!-- Offline Badge -->
								<div
									v-if="isOffline"
									class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium"
								>
									<FeatherIcon
										name="wifi-off"
										class="w-3.5 h-3.5"
										:stroke-width="2"
									/>
									{{ __("Offline") }}
								</div>
							</div>

							<!-- PIN Form: the user's PIN, when they have one -->
							<form v-if="usePin" @submit.prevent="handleUnlock" class="space-y-4">
								<div>
									<label
										class="block text-sm font-medium text-gray-700 mb-1.5 text-center"
									>
										{{ __("Enter your PIN") }}
									</label>
									<input
										ref="pinInputRef"
										v-model="pin"
										type="password"
										inputmode="numeric"
										autocomplete="off"
										:maxlength="pinInfo.length"
										:placeholder="'•'.repeat(pinInfo.length)"
										:disabled="isVerifying"
										@input="onPinInput"
										class="block w-full rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.5em] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
										:class="
											verifyError
												? 'border-red-400 bg-red-50'
												: 'border-gray-300'
										"
									/>
									<p
										v-if="verifyError"
										class="mt-1.5 text-sm text-red-600 text-center"
									>
										{{ verifyError }}
									</p>
								</div>
								<button
									type="submit"
									:disabled="pin.length !== pinInfo.length || isVerifying"
									class="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<span
										v-if="isVerifying"
										class="flex items-center justify-center gap-2"
									>
										<FeatherIcon name="loader" class="h-4 w-4 animate-spin" />
										{{ __("Verifying...") }}
									</span>
									<span v-else>{{ __("Unlock") }}</span>
								</button>
								<button
									type="button"
									@click="switchMode(false)"
									class="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline"
								>
									{{ __("Use password instead") }}
								</button>
							</form>

							<!-- Password Form -->
							<form v-else @submit.prevent="handleUnlock" class="space-y-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1.5">
										{{ __("Password") }}
									</label>
									<div class="relative">
										<input
											ref="passwordInputRef"
											v-model="password"
											:type="showPassword ? 'text' : 'password'"
											:placeholder="__('Enter your password')"
											:disabled="isVerifying"
											class="block w-full rounded-lg border px-3 py-2.5 pe-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
											:class="
												verifyError
													? 'border-red-400 bg-red-50'
													: 'border-gray-300'
											"
											autocomplete="current-password"
										/>
										<button
											type="button"
											@click="showPassword = !showPassword"
											class="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none"
											:disabled="isVerifying"
											tabindex="-1"
											:aria-label="
												showPassword
													? __('Hide password')
													: __('Show password')
											"
										>
											<FeatherIcon
												:name="showPassword ? 'eye-off' : 'eye'"
												class="w-4.5 h-4.5"
												:stroke-width="2"
											/>
										</button>
									</div>
									<!-- Error Message -->
									<p v-if="verifyError" class="mt-1.5 text-sm text-red-600">
										{{ verifyError }}
									</p>
								</div>

								<!-- Unlock Button -->
								<button
									type="submit"
									:disabled="!password || isVerifying"
									class="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<span
										v-if="isVerifying"
										class="flex items-center justify-center gap-2"
									>
										<FeatherIcon name="loader" class="h-4 w-4 animate-spin" />
										{{ __("Verifying...") }}
									</span>
									<span v-else>{{ __("Unlock") }}</span>
								</button>
								<button
									v-if="pinInfo.hasPin"
									type="button"
									@click="switchMode(true)"
									class="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline"
								>
									{{ __("Use PIN instead") }}
								</button>
							</form>

							<!-- Divider -->
							<div class="relative my-5">
								<div class="absolute inset-0 flex items-center">
									<div class="w-full border-t border-gray-200"></div>
								</div>
								<div class="relative flex justify-center text-xs">
									<span class="bg-white px-3 text-gray-400">{{ __("or") }}</span>
								</div>
							</div>

							<!-- Sign Out Button -->
							<button
								@click="handleSignOut"
								:disabled="isVerifying"
								class="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
							>
								{{ __("Sign Out") }}
							</button>
						</div>
					</div>
				</FocusScope>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { FeatherIcon } from "frappe-ui";
import { FocusScope } from "reka-ui";
import { useSessionLock } from "@/composables/useSessionLock";
import { useOfflineStatus } from "@/composables/useOfflineStatus";
import { session } from "@/data/session";
import { cleanupUserSession } from "@/utils/sessionCleanup";

const { isLocked, isVerifying, verifyError, lockedUser, unlock, pinInfo, clearVerifyError } =
	useSessionLock();
const { isOffline } = useOfflineStatus();

const password = ref("");
const showPassword = ref(false);
const passwordInputRef = ref(null);
const pin = ref("");
const pinInputRef = ref(null);
// The PIN when the user has one; the password is always there to fall back on
const choosePin = ref(true);
const usePin = computed(() => pinInfo.value.hasPin && choosePin.value);

async function focusInput() {
	await nextTick();
	(usePin.value ? pinInputRef : passwordInputRef).value?.focus();
}

// Auto-focus the PIN (or password) input when locked
watch(isLocked, async (locked) => {
	if (locked) {
		password.value = "";
		pin.value = "";
		showPassword.value = false;
		choosePin.value = true;
		await focusInput();
	}
});

function switchMode(toPin) {
	choosePin.value = toPin;
	clearVerifyError();
	focusInput();
}

// Digits only; unlocks on its own once the PIN is complete
function onPinInput() {
	pin.value = pin.value.replace(/\D/g, "").slice(0, pinInfo.value.length);
	if (pin.value.length === pinInfo.value.length) handleUnlock();
}

async function handleUnlock() {
	const secret = usePin.value ? pin.value : password.value;
	if (!secret || isVerifying.value) return;

	const result = await unlock(secret, usePin.value ? "pin" : "password");

	if (result.sessionExpired) {
		// Session expired — full logout
		await cleanupUserSession();
		session.logout.submit();
		return;
	}

	if (!result.success) {
		// Wrong PIN or password — clear and re-focus
		password.value = "";
		pin.value = "";
		await focusInput();
	}
}

async function handleSignOut() {
	await cleanupUserSession();
	session.logout.submit();
}
</script>

<style scoped>
.lock-overlay-enter-active,
.lock-overlay-leave-active {
	transition: opacity 0.3s ease;
}

.lock-overlay-enter-from,
.lock-overlay-leave-to {
	opacity: 0;
}
</style>
