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

  const colors = {
    success: 'bg-correct/20 border-correct text-correct',
    error: 'bg-incorrect/20 border-incorrect text-incorrect',
    info: 'bg-accent/20 border-accent text-accent',
  }

  return (
    <div className={`px-4 py-3 rounded-lg border text-sm ${colors[t.type] || colors.info} animate-[slideIn_0.2s_ease-out]`}>
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
    <div className="fixed bottom-20 right-4 md:bottom-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={handleRemove} />
      ))}
    </div>
  )
}
