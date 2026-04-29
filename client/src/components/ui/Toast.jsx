import { useState, useEffect, useCallback } from 'react'
import { create } from 'zustand'

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { id: Date.now(), ...toast }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

export function toast(message, type = 'info') {
  useToastStore.getState().addToast({ message, type })
}

function ToastItem({ toast: t, onRemove }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(t.id), 3000)
    return () => clearTimeout(timer)
  }, [t.id, onRemove])

  // Darker green/red than the theme's `correct`/`incorrect` so white text
  // hits ~4.5:1 contrast. The theme tokens stay bright (used for win/loss
  // chips, etc.) — toasts get their own slightly darker fill.
  const colors = {
    success: 'bg-[#15803D] border-[#15803D] text-white',
    error: 'bg-[#B91C1C] border-[#B91C1C] text-white',
    info: 'bg-accent border-accent text-white',
  }

  return (
    <div className={`px-4 py-3 rounded-lg border text-sm font-semibold shadow-lg ${colors[t.type] || colors.info} animate-[slideIn_0.2s_ease-out]`}>
      {t.message}
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const handleRemove = useCallback((id) => removeToast(id), [removeToast])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-4 md:bottom-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={handleRemove} />
      ))}
    </div>
  )
}
