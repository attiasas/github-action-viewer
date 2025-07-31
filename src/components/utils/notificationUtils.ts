
export type NotificationAnimation = 'fade' | 'slide' | 'improvement' | 'failure';
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

export function InfoNotification(message: string) {
  pushNotification(message, 'info');
}

export function ImprovementNotification(message: string) {
  pushNotification(message, 'success');
}

export function FailureNotification(message: string) {
  pushNotification(message, 'error');
}

export function WarningNotification(message: string) {
  pushNotification(message, 'warning');
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
    type: type,
    duration: duration,
    animation: animation,
    timestamp: Date.now(),
  };
  notificationListeners.forEach(listener => listener(notification));
}
