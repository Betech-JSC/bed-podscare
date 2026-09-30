<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div class="relative w-full max-w-lg overflow-hidden bg-white rounded-2xl shadow-2xl transition-all">
      
      <!-- HEADER -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900">Thanh toán qua VietQR (SePay)</h3>
            <p class="text-xs text-gray-500">Mở App ngân hàng bất kỳ để quét mã</p>
          </div>
        </div>
        <button @click="handleClose" class="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- BODY: TRẠNG THÁI CHỜ THANH TOÁN -->
      <div v-if="!isSuccess && !isExpired" class="p-6 space-y-6">
        
        <!-- Khung ảnh QR & Countdown -->
        <div class="flex flex-col items-center">
          <div class="relative p-2 bg-white rounded-xl border border-gray-200 shadow-sm">
            <img 
              :src="paymentData.qr_url" 
              alt="Mã QR SePay VietQR" 
              class="w-64 h-64 object-contain rounded-lg"
            />
          </div>

          <!-- Đồng hồ đếm ngược -->
          <div class="mt-3 flex items-center gap-1.5 text-xs font-medium" :class="timeLeft < 120 ? 'text-rose-600 animate-pulse' : 'text-gray-600'">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Mã QR hết hạn sau: <strong>{{ formatTime(timeLeft) }}</strong></span>
          </div>
        </div>

        <!-- Chi tiết thông tin chuyển khoản -->
        <div class="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3 text-sm">
          
          <!-- Ngân hàng -->
          <div class="flex items-center justify-between">
            <span class="text-gray-500">Ngân hàng:</span>
            <span class="font-bold text-gray-900">{{ paymentData.bank_info?.bank_code }}</span>
          </div>

          <!-- Số tài khoản -->
          <div class="flex items-center justify-between">
            <span class="text-gray-500">Số tài khoản:</span>
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-gray-900">{{ paymentData.bank_info?.account_number }}</span>
              <button 
                @click="copyText(paymentData.bank_info?.account_number, 'stk')"
                class="px-2 py-0.5 text-xs font-medium rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm transition"
              >
                {{ copiedField === 'stk' ? '✓ Đã chép' : 'Sao chép' }}
              </button>
            </div>
          </div>

          <!-- Chủ tài khoản -->
          <div class="flex items-center justify-between">
            <span class="text-gray-500">Chủ tài khoản:</span>
            <span class="font-bold text-gray-900 uppercase">{{ paymentData.bank_info?.account_holder }}</span>
          </div>

          <!-- Số tiền -->
          <div class="flex items-center justify-between">
            <span class="text-gray-500">Số tiền:</span>
            <div class="flex items-center gap-2">
              <span class="font-bold text-emerald-600 text-base">{{ formatMoney(paymentData.amount) }} đ</span>
              <button 
                @click="copyText(paymentData.amount, 'amount')"
                class="px-2 py-0.5 text-xs font-medium rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm transition"
              >
                {{ copiedField === 'amount' ? '✓ Đã chép' : 'Sao chép' }}
              </button>
            </div>
          </div>

          <!-- Nội dung chuyển khoản -->
          <div class="flex items-center justify-between pt-2 border-t border-gray-200">
            <span class="text-rose-600 font-semibold text-xs">Nội dung CK:</span>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded font-mono font-black text-rose-600 bg-rose-50 border border-rose-200">
                {{ paymentData.reference_code }}
              </span>
              <button 
                @click="copyText(paymentData.reference_code, 'ref')"
                class="px-2 py-0.5 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition"
              >
                {{ copiedField === 'ref' ? '✓ Đã chép' : 'Sao chép' }}
              </button>
            </div>
          </div>

        </div>

        <p class="text-xs text-center text-gray-500">
          ⚠️ <strong>Lưu ý:</strong> Vui lòng giữ nguyên chính xác nội dung chuyển khoản để hệ thống tự động kích hoạt tức thì.
        </p>
      </div>

      <!-- BODY: TRẠNG THÁI THÀNH CÔNG -->
      <div v-else-if="isSuccess" class="p-8 text-center space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h4 class="text-xl font-bold text-gray-900">Thanh toán thành công!</h4>
        <p class="text-sm text-gray-600">Hệ thống đã xác nhận thanh toán cho đơn hàng của bạn.</p>
        <button 
          @click="onPaymentSuccess" 
          class="w-full py-2.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition"
        >
          Hoàn tất
        </button>
      </div>

      <!-- BODY: TRẠNG THÁI HẾT HẠN -->
      <div v-else-if="isExpired" class="p-8 text-center space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
          <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h4 class="text-xl font-bold text-gray-900">Mã QR đã hết hiệu lực</h4>
        <p class="text-sm text-gray-600">Phiên thanh toán đã hết hạn 15 phút. Vui lòng bấm tạo mã mới.</p>
        <button 
          @click="$emit('renew')" 
          class="w-full py-2.5 px-4 rounded-xl font-bold text-white bg-gray-900 hover:bg-black shadow-md transition"
        >
          Tạo lại mã thanh toán
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import axios from 'axios'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  paymentData: {
    type: Object,
    required: true,
    default: () => ({
      reference_code: '',
      qr_url: '',
      amount: 0,
      expires_at: null,
      bank_info: {
        bank_code: 'MB',
        account_number: '',
        account_holder: '',
      },
    }),
  },
})

const emit = defineEmits(['close', 'success', 'renew'])

const isSuccess = ref(false)
const isExpired = ref(false)
const timeLeft = ref(900) // 15 phút mặc định (900 giây)
const copiedField = ref('')

let pollingInterval = null
let countdownInterval = null

// Khởi chạy đồng hồ đếm ngược và Polling
function startTimers() {
  stopTimers()
  isSuccess.value = false
  isExpired.value = false

  if (props.paymentData.expires_at) {
    const expireTime = new Date(props.paymentData.expires_at).getTime()
    timeLeft.value = Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
  } else {
    timeLeft.value = 900
  }

  // Countdown timer mỗi 1 giây
  countdownInterval = setInterval(() => {
    if (timeLeft.value > 0) {
      timeLeft.value -= 1
    } else {
      isExpired.value = true
      stopTimers()
    }
  }, 1000)

  // Polling mỗi 3 giây kiểm tra trạng thái từ backend
  pollingInterval = setInterval(async () => {
    if (!props.paymentData.reference_code) return

    try {
      const { data } = await axios.get(`/payment/sepay/check/${props.paymentData.reference_code}`)
      if (data.is_paid) {
        isSuccess.value = true
        stopTimers()
      }
    } catch (err) {
      // Bỏ qua lỗi polling mạng tạm thời
    }
  }, 3000)
}

function stopTimers() {
  if (pollingInterval) clearInterval(pollingInterval)
  if (countdownInterval) clearInterval(countdownInterval)
}

function handleClose() {
  stopTimers()
  emit('close')
}

function onPaymentSuccess() {
  emit('success', props.paymentData)
  handleClose()
}

function copyText(text, fieldName) {
  if (!text) return
  navigator.clipboard.writeText(String(text))
  copiedField.value = fieldName
  setTimeout(() => {
    if (copiedField.value === fieldName) copiedField.value = ''
  }, 2000)
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function formatMoney(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0)
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    startTimers()
  } else {
    stopTimers()
  }
})

onUnmounted(() => {
  stopTimers()
})
</script>
