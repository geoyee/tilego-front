import { createI18n } from 'vue-i18n'
import type { Locale } from '@/types'
import zhCN from './zh-CN'
import enUS from './en-US'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

const savedLocale = localStorage.getItem('locale') as Locale | null

const i18n = createI18n({
  legacy: false,
  locale: savedLocale || 'zh-CN',
  fallbackLocale: 'en-US',
  messages,
})

export default i18n

export const setLocale = (locale: Locale) => {
  localStorage.setItem('locale', locale)
  i18n.global.locale.value = locale
}

export const getLocale = (): Locale => {
  return i18n.global.locale.value as Locale
}
