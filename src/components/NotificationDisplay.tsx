import { useState, useRef, useEffect } from 'react';
import './NotificationDisplay.css';
import { calculateStabilityScore } from '../components/utils/StatusUtils';
import type { RepositoryStatus, WorkflowStatus } from '../api/Repositories';
import { notificationListeners } from './utils/notificationUtils';
import type { NotificationEvent } from './utils/notificationUtils';

export type NotificationAnimation = 'fade' | 'slide';
export type NotificationType = 'default' | 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  message: string;
  type?: NotificationType;
  duration?: number; // ms
  animation?: NotificationAnimation;
  timestamp?: number;
};

export interface NotificationDisplayProps {
  repositoriesStatus: RepositoryStatus[];
}

export default function NotificationDisplay({ repositoriesStatus }: NotificationDisplayProps) {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [current, setCurrent] = useState<Notification | null>(null);
  const [history, setHistory] = useState<Notification[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHistoryOpenRef = useRef<number>(Date.now());

  // Listen for global notifications
  useEffect(() => {
    const listener: NotificationEvent = (notification) => {
      setQueue(prev => [...prev, notification]);
    };
    notificationListeners.push(listener);
    return () => {
      const idx = notificationListeners.indexOf(listener);
      if (idx !== -1) notificationListeners.splice(idx, 1);
    };
  }, []);

  // Pop notifications from queue
  useEffect(() => {
    if (!current && queue.length > 0) {
      const next = queue[0];
      setCurrent(next);
      setQueue(q => q.slice(1));
      setHistory(h => [next, ...h]);
    }
  }, [current, queue]);

  // Handle timer for current notification
  useEffect(() => {
    if (current) {
      timerRef.current = setTimeout(() => {
        setCurrent(null);
      }, current.duration || 3000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [current]);

  // Default display: stability score
  const allRunsForAnalytics: Array<{ branch: string, workflowKey: string, workflow: WorkflowStatus[] }> = [];
  repositoriesStatus.forEach(repo => {
    Object.entries(repo.branches).forEach(([branchName, branchData]) => {
        Object.entries(branchData.workflows).forEach(([workflowKey, workflowRuns]) => {
                allRunsForAnalytics.push({ branch: branchName, workflowKey, workflow: workflowRuns as WorkflowStatus[] });
            }); 
        });
    });
  const stabilityScore = calculateStabilityScore(allRunsForAnalytics);

  // Animation classes
  const getAnimationClass = (notif: Notification | null) => {
    if (!notif) return 'notification-fade';
    return notif.animation ? `notification-${notif.animation}` : 'notification-fade';
  };

  // Click to show history
  // Count unread notifications since last history open
  const unreadCount = history.filter(n => n.timestamp && n.timestamp > lastHistoryOpenRef.current).length;

  const handleClick = () => {
    setShowHistory(true);
    lastHistoryOpenRef.current = Date.now();
  };
  const handleCloseHistory = () => {
    setShowHistory(false);
  };

  return (
    <div className="notification-display-container" onClick={handleClick}>
      <div className="notification-display" style={{ cursor: 'pointer' }}>
        {current ? (
          <span className={`notification-msg notification-${current.type || 'default'} ${getAnimationClass(current)}`}>{current.message}</span>
        ) : (
          <div className="notification-default-layout">
            <div className="notification-default-main">
              Stability Score:&nbsp;<strong>{stabilityScore !== null ? stabilityScore : 'N/A'}</strong>
            </div>
            {unreadCount > 0 && (
              <div className="notification-default-indicator">
                <span className="notification-unread-indicator" aria-label={`${unreadCount} new notifications`}>
                  {unreadCount > 99 ? '99' : unreadCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {showHistory && (
        <>
          <div className="notification-history-backdrop" onClick={handleCloseHistory}></div>
          <div className="notification-history-popup" onClick={e => e.stopPropagation()}>
            <div className="notification-history-header">
              <span>Notification History</span>
              <button className="close-history" onClick={handleCloseHistory}>×</button>
            </div>
            <ul>
              {history.map(n => (
                <li key={n.id} className={`notification-history-item notification-${n.type || 'default'}`}>
                  <span>{n.message}</span>
                  <span className="notification-history-time">{n.timestamp ? new Date(n.timestamp).toLocaleTimeString() : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
