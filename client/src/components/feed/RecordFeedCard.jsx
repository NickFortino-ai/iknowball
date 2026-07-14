import FeedCardWrapper from './FeedCardWrapper'
import { formatRecordValue, formatRecordPreviousValue } from '../../lib/recordFormat'

export default function RecordFeedCard({ item, reactions, onUserTap, onRecordTap }) {
  const { record } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="gold"
      targetType="record_history"
      targetId={record.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      headerLayout="centered"
    >
      <div
        className="text-center cursor-pointer"
        onClick={() => onRecordTap?.(record.id)}
      >
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="text-xl">{'🏆'}</span>
          <span className="font-bold text-sm text-yellow-500">Record Broken!</span>
        </div>

        <div className="font-semibold text-base text-text-primary mb-2">{record.display_name}</div>

        <div className="font-display text-4xl text-yellow-500 font-bold mb-2">
          {formatRecordValue(record)}
        </div>

        {record.previous_value != null && (
          <div className="text-xs text-text-muted">
            was {formatRecordPreviousValue(record, record.previous_value)}
            {record.previous_holder_username && (
              <> by @{record.previous_holder_username}</>
            )}
          </div>
        )}
      </div>
    </FeedCardWrapper>
  )
}
