import FeedCardWrapper from './FeedCardWrapper'

export default function RecordFeedCard({ item, reactions, onUserTap }) {
  const { record } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="gold"
      targetType="record_history"
      targetId={record.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{'\uD83C\uDFC6'}</span>
        <span className="font-bold text-sm text-yellow-500">Record Broken!</span>
      </div>

      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
        <div className="font-semibold text-sm">{record.display_name}</div>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="text-yellow-500 font-bold">{record.new_value}</span>
          {record.previous_value != null && (
            <>
              <span className="text-text-muted">was {record.previous_value}</span>
              {record.previous_holder_username && (
                <span className="text-text-muted">by @{record.previous_holder_username}</span>
              )}
            </>
          )}
        </div>
      </div>
    </FeedCardWrapper>
  )
}
