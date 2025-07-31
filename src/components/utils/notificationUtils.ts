
export type NotificationAnimation = 'fade' | 'slide';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  message: string;
  ignoreUnread: boolean; // If true, this notification won't count towards unread count
  type?: NotificationType;
  duration?: number; // ms
  animation?: NotificationAnimation;
  timestamp?: number;
};

export const DEFAULT_ANIMATION = 'fade';

// Simple global event system for notifications
export type NotificationEvent = (notification: Notification) => void;
export const notificationListeners: NotificationEvent[] = [];

export function RefreshSuccessNotification(repoName: string) {
  pushNotification(`${repoName} refreshed successfully`, 'info');
}

export function pushNotification(
  message: string,
  type: NotificationType = 'info',
  animation?: NotificationAnimation,
  duration?: number
) {
  if (!message) return; // Ignore empty messages
  if (!animation) {
    switch (type) {
      case 'success':
        animation = 'slide';
        break;
      case 'error':
        animation = 'fade';
        break;
      case 'warning':
        animation = 'fade';
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
      case 'success':
        duration = 3000;
        break;
      case 'warning':
        duration = 4000;
        break;
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
    type: type,
    duration: duration,
    animation: animation,
    timestamp: Date.now(),
  };
  notificationListeners.forEach(listener => listener(notification));
}
