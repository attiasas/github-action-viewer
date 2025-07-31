// Notification system utilities
import type { Notification, NotificationType, NotificationAnimation } from '../NotificationDisplay';

export const DEFAULT_ANIMATION = 'fade';

// Simple global event system for notifications
export type NotificationEvent = (notification: Notification) => void;
export const notificationListeners: NotificationEvent[] = [];

export function pushNotification(
  message: string,
  type: NotificationType = 'default',
  animation: NotificationAnimation = DEFAULT_ANIMATION,
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
