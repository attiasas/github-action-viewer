import { useState, useRef, useEffect } from 'react';
import { calculateStabilityScore } from '../components/utils/StatusUtils';
import { formatRelativeTime } from '../components/utils/indicationsUtils';
import type { RepositoryStatus, WorkflowStatus } from '../api/Repositories';
import { notificationListeners } from './utils/notificationUtils';
import type { Notification, NotificationEvent } from './utils/notificationUtils';
import './NotificationDisplay.css';

export interface NotificationDisplayProps {
  repositoriesStatus: RepositoryStatus[];
}

// Firework explosion logic
type Firework = {
  id: number;
  color: string;
  left: string;
  top: string;
  delay: number;
};
const FIREWORK_COLORS = [
  '#FFD700', '#FF69B4', '#00CFFF', '#FF4500', '#B266FF'
];
function getRandomFirework(id: number, side: 'left' | 'right'): Firework {
  // Evenly distribute: alternate sides by index
  const left = side === 'left'
    ? `${5 + Math.random() * 13}%`
    : `${82 + Math.random() * 13}%`;
  const top = `${30 + Math.random() * 40}%`;
  return {
    id,
    color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
    left,
    top,
    delay: Math.random() * 0.7,
  };
}

export default function NotificationDisplay({ repositoriesStatus }: NotificationDisplayProps) {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [current, setCurrent] = useState<Notification | null>(null);
  const [history, setHistory] = useState<Notification[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHistoryOpenRef = useRef<number>(Date.now());
  // Firework state for improvement animation
  const [fireworks, setFireworks] = useState<Firework[]>([]);
  const fireworkTimeouts = useRef<NodeJS.Timeout[]>([]);

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

  // Firework logic for improvement animation
  useEffect(() => {
    if (current && current.animation === 'improvement') {
      const count = 4 + Math.floor(Math.random() * 3);
      const fwks = [];
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 'left' : 'right';
        fwks.push(getRandomFirework(i, side));
      }
      setFireworks(fwks);
      fireworkTimeouts.current.forEach(clearTimeout);
      fireworkTimeouts.current = [
        setTimeout(() => setFireworks([]), 4800),
      ];
    } else {
      setFireworks([]);
    }
    return () => {
      fireworkTimeouts.current.forEach(clearTimeout);
    };
  }, [current]);

  // Click to show history
  // Count unread notifications since last history open
  const unreadCount = history.filter(n => n.timestamp && n.timestamp > lastHistoryOpenRef.current && !n.ignoreUnread).length;

  const handleClick = () => {
    setShowHistory(true);
    lastHistoryOpenRef.current = Date.now();
  };
  const handleCloseHistory = () => {
    setShowHistory(false);
  };

  return (
    <div className="notification-display-container" onClick={handleClick}>
      <div className="notification-display" style={{ cursor: 'pointer', position: 'relative' }}>
        {/* Firework explosions for improvement animation */}
        {current && current.animation === 'improvement' && fireworks.map(fw => (
          <svg
            key={fw.id}
            className="notification-firework-svg"
            style={{
              left: fw.left,
              top: fw.top,
              animationDelay: `${fw.delay}s`,
            }}
            width="32" height="32" viewBox="0 0 32 32"
          >
            <circle cx="16" cy="16" r="7" fill={fw.color} opacity="0.7" />
            <g>
              <line x1="16" y1="3" x2="16" y2="11" stroke={fw.color} strokeWidth="2" />
              <line x1="16" y1="21" x2="16" y2="29" stroke={fw.color} strokeWidth="2" />
              <line x1="3" y1="16" x2="11" y2="16" stroke={fw.color} strokeWidth="2" />
              <line x1="21" y1="16" x2="29" y2="16" stroke={fw.color} strokeWidth="2" />
              <line x1="7" y1="7" x2="12" y2="12" stroke={fw.color} strokeWidth="2" />
              <line x1="25" y1="25" x2="20" y2="20" stroke={fw.color} strokeWidth="2" />
              <line x1="7" y1="25" x2="12" y2="20" stroke={fw.color} strokeWidth="2" />
              <line x1="25" y1="7" x2="20" y2="12" stroke={fw.color} strokeWidth="2" />
            </g>
          </svg>
        ))}
        {current ? (
          <span className={`notification-msg notification-${current.type || 'info'} ${getAnimationClass(current)}`}>{current.message}</span>
        ) : (
          <div className="notification-default-layout">
            <div className="notification-default-main">
              Stability Score:&nbsp;<strong>{stabilityScore !== null ? stabilityScore : 'N/A'}</strong>
            </div>
            {unreadCount > 0 && (
              <div className="notification-default-indicator">
                {(() => {
                  const displayCount = unreadCount > 99 ? '99' : unreadCount.toString();
                  const digitCount = displayCount.length;
                  // Smaller base and scaling for all circles
                  const base = 28;
                  const size = base + (digitCount - 1) * 9;
                  return (
                    <span
                      className="notification-unread-indicator"
                      aria-label={`${unreadCount} new notifications`}
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        fontSize: digitCount > 2 ? '0.92em' : '1em',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {displayCount}
                    </span>
                  );
                })()}
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
            <ul className="notification-history-list">
              {history.length === 0 ? (
                <li className="notification-empty">
                  <span>No notifications yet.<br />You will see workflow updates and alerts here.</span>
                </li>
              ) : (
                history.map(n => (
                  <li key={n.id} className={`notification-history-item notification-${n.type || 'info'}`}>
                    <span className="notification-history-message">{n.message}</span>
                    <span className="notification-history-time">{typeof n.timestamp === 'number' ? formatRelativeTime(new Date(n.timestamp).toISOString()) : ''}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
