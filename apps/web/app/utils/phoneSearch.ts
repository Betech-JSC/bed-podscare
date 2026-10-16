export * from '@podscare/ui';
export {
  INVISIBLE_UNICODE_REGEX,
  sanitizeInputLive,
  sanitizeInputText,
  sanitizeSearchQuery,
  normalizePhoneForStorage,
  normalizePhoneForSubmit,
  extractPhoneCoreDigits,
  isPhoneLikeQuery,
  matchesPhoneFlexible,
} from '../../../../packages/ui/src/utils/text';
