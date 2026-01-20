/**
 * Proposed Stop Card
 * Displays a proposed stop for user approval during conversation planning
 */

import { useTranslation } from 'react-i18next';
import { ProposedStop } from '../../types/conversation';

interface ProposedStopCardProps {
  proposal: ProposedStop;
  onApprove: () => void;
  onReject: () => void;
  onModify: () => void;
  isLoading?: boolean;
}

const STOP_TYPE_ICONS: Record<string, string> = {
  viewpoint: '🏔️',
  coffee: '☕',
  food: '🍽️',
  spring: '💧',
  parking: '🅿️',
  hotel: '🏨',
  custom: '📍',
};

export default function ProposedStopCard({
  proposal,
  onApprove,
  onReject,
  onModify,
  isLoading = false,
}: ProposedStopCardProps) {
  const { t } = useTranslation();
  const icon = STOP_TYPE_ICONS[proposal.poi.type] || '📍';

  return (
    <div className="proposed-stop-card glass-card">
      <div className="stop-header">
        <span className="stop-icon">{icon}</span>
        <div className="stop-info">
          <h3 className="stop-name">{proposal.poi.name}</h3>
          <span className="stop-type">{t(`stopTypes.${proposal.poi.type}`)}</span>
        </div>
      </div>

      <p className="stop-reason">{proposal.reason}</p>

      <div className="stop-meta">
        <span className="duration">
          ⏱️ {proposal.estimated_duration_minutes} {t('common.min')}
        </span>
        {proposal.poi.distance_from_route_km && (
          <span className="distance">
            📍 {proposal.poi.distance_from_route_km.toFixed(1)} {t('common.km')}
          </span>
        )}
      </div>

      <div className="stop-actions">
        <button
          className="approve-btn primary-btn"
          onClick={onApprove}
          disabled={isLoading}
        >
          ✓ {t('chat.approveStop')}
        </button>
        <button
          className="reject-btn secondary-btn"
          onClick={onReject}
          disabled={isLoading}
        >
          {t('chat.skipStop')}
        </button>
        <button
          className="modify-btn ghost-btn"
          onClick={onModify}
          disabled={isLoading}
        >
          {t('chat.suggestDifferent')}
        </button>
      </div>
    </div>
  );
}
