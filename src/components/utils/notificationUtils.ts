// import { getIndications } from './indicationsUtils';
import type { Severity } from './StatusUtils';

export type NotificationAnimation = 'fade' | 'slide' | 'improvement' | 'failure';
 
export type Notification = {
  id: string;
  message: string;
  ignoreUnread: boolean; // If true, this notification won't count towards unread count
  severity?: Severity;
  duration?: number; // ms
  animation?: NotificationAnimation;
  timestamp?: number;
  repositoryId?: number; // Optional repository ID for context
};

export const DEFAULT_ANIMATION = 'fade';

// Simple global event system for notifications
export type NotificationEvent = (notification: Notification) => void;
export const notificationListeners: NotificationEvent[] = [];

export function InfoNotification(message: string, repositoryId?: number) {
  pushNotification(message, 'info', repositoryId);
}

export function ImprovementNotification(message: string, repositoryId?: number) {
  pushNotification(message, 'success', repositoryId);
}

export function FailureNotification(message: string, repositoryId?: number) {
  pushNotification(message, 'error', repositoryId);
}

export function WarningNotification(message: string, repositoryId?: number) {
  pushNotification(message, 'warning', repositoryId);
}

export function pushNotification(
  message: string,
  type: Severity = 'info',
  repositoryId?: number,
  animation?: NotificationAnimation,
  duration?: number,
) {
  if (!message) return; // Ignore empty messages
  if (!animation) {
    switch (type) {
      case 'success':
        animation = 'improvement';
        break;
      case 'error':
        animation = 'failure';
        break;
      case 'warning':
        animation = 'failure';
        break;
      case 'info':
        animation = 'slide';
        break;
      default:
        animation = DEFAULT_ANIMATION;
        break;
    }
  }
  if (duration === undefined || duration < 1000) {
    switch (type) {
      case 'warning':
        duration = 4000;
        break;
      case 'success':
      case 'error':
        duration = 5000;
        break;
      default:
        duration = 2000;
        break;
    }
  }
  const notification: Notification = {
    id: `${Date.now()}-${Math.random()}`,
    message: message,
    ignoreUnread: type === 'info',
    severity: type,
    duration: duration,
    animation: animation,
    timestamp: Date.now(),
    repositoryId: repositoryId,
  };
  notificationListeners.forEach(listener => listener(notification));
}

export function addNotificationListener(listener: NotificationEvent) {
  notificationListeners.push(listener);
}

export function removeNotificationListener(listener: NotificationEvent) {
  const idx = notificationListeners.indexOf(listener);
  if (idx !== -1) {
    notificationListeners.splice(idx, 1);
  }
}

// export function getNotificationsAfterUpdate(repositoryId: number, current: Array<{ branch: string; workflowKey: string; jobRuns: WorkflowStatus[] }>, before?: Array<{ branch: string; workflowKey: string; jobRuns: WorkflowStatus[] }>): Notification[] {
//   const notifications: Notification[] = [];
//   if (!before) return getIndications(current).map(ind => ({
//     id: `${Date.now()}-${Math.random()}`,
//     message: `New runs detected for workflow ${ind.workflowKey} on branch ${ind.branch}.`,
//     severity: ind.severity,
//     repositoryId,
//   }));

//   const currentMap = new Map(current.map(item => [`${item.branch}-${item.workflowKey}`, item]));
//   const beforeMap = new Map(before.map(item => [`${item.branch}-${item.workflowKey}`, item]));

//   current.forEach(item => {
//     const key = `${item.branch}-${item.workflowKey}`;
//     const beforeItem = beforeMap.get(key);
//     if (!beforeItem || JSON.stringify(beforeItem.jobRuns) !== JSON.stringify(item.jobRuns)) {
//       notifications.push({
//         id: `${Date.now()}-${Math.random()}`,
//         message: `Workflow ${item.workflowKey} on branch ${item.branch} has new runs.`,
//         severity: 'info',
//         repositoryId,
//       });
//     }
//   });

//   return notifications;
// }