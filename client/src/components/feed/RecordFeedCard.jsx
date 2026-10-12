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
      /* The headline goes ABOVE the avatar, not buried between the username
         and the record name. It is what the card is — who broke it is the
         second question, not the first — and at that size it was smaller
         than the handle beneath it.

         The trophy goes with it. A gold left border, gold heading and gold
         figure already say "record"; a fourth signal in the same two inches
         is decoration rather than information. */
      topBanner={(
        <div className="text-center pt-1 pb-3">
          <span className="font-display text-2xl font-bold text-yellow-500 tracking-tight">
            Record Broken
          </span>
        </div>
      )}
    >
      <div
        className="text-center cursor-pointer"
        onClick={() => onRecordTap?.(record.id)}
      >
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
