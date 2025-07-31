import { useState, useRef, useEffect } from 'react';
import './NotificationDisplay.css';
import { calculateStabilityScore } from '../components/utils/StatusUtils';
import type { RepositoryStatus, WorkflowStatus } from '../api/Repositories';

export type Notification = {
  id: string;
  message: string;
  type?: string;
  duration?: number; // ms
  animation?: string; // animation key
  timestamp?: number;
};

export interface NotificationDisplayProps {
  repositoriesStatus: RepositoryStatus[];
}

const DEFAULT_ANIMATION = 'fade';

// Simple global event system for notifications
type NotificationEvent = (notification: Notification) => void;
const notificationListeners: NotificationEvent[] = [];

export function pushNotification(
  message: string,
  type: string = 'default',
  animation: string = DEFAULT_ANIMATION,
  duration: number = 5000
) {
  const notification: Notification = {
    id: `${Date.now()}-${Math.random()}`,
    message,
    type,
    duration,
    animation,
    timestamp: Date.now(),
  };
  notificationListeners.forEach(listener => listener(notification));
}

export default function NotificationDisplay({ repositoriesStatus }: NotificationDisplayProps) {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [current, setCurrent] = useState<Notification | null>(null);
  const [history, setHistory] = useState<Notification[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
  const handleClick = () => {
    setShowHistory(true);
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
          <span className="notification-default">
            Stability Score: <strong>{stabilityScore !== null ? stabilityScore : 'N/A'}</strong>
          </span>
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
