// Notification system utilities
import type { Notification } from '../NotificationDisplay';

export const DEFAULT_ANIMATION = 'fade';

// Simple global event system for notifications
export type NotificationEvent = (notification: Notification) => void;
export const notificationListeners: NotificationEvent[] = [];

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
