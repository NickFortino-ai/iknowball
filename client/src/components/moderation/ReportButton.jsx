import { useState } from 'react'
import ReportModal from './ReportModal'

export default function ReportButton({ targetType, targetId, reportedUserId, className = '' }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
        className={`text-text-muted hover:text-text-secondary transition-colors ${className}`}
        title="Report"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </button>
      {showModal && (
        <ReportModal
          targetType={targetType}
          targetId={targetId}
          reportedUserId={reportedUserId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
