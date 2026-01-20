/**
 * Quick Reply Buttons
 * Displays quick reply suggestions during conversation
 */

import { QuickReply } from '../../types/conversation';

interface QuickReplyButtonsProps {
  replies: QuickReply[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export default function QuickReplyButtons({
  replies,
  onSelect,
  disabled = false,
}: QuickReplyButtonsProps) {
  if (!replies.length) return null;

  return (
    <div className="quick-reply-container">
      {replies.map((reply, index) => (
        <button
          key={`${reply.value}-${index}`}
          className="quick-reply-btn glass-btn"
          onClick={() => onSelect(reply.value)}
          disabled={disabled}
        >
          {reply.icon && <span className="reply-icon">{reply.icon}</span>}
          <span className="reply-label">{reply.label}</span>
        </button>
      ))}
    </div>
  );
}
