/**
 * Dashboard Module Exports
 * 
 * Central export point for all dashboard-related components
 */

export { DashboardGenerator } from './generator';
export { DashboardBuilder } from './builders/dashboard-builder';
export { StandardMessageQueueDashboard } from './templates/standard-message-queue-dashboard';

// Export types separately
export type { DashboardBuilderOptions, DashboardDeploymentResult } from './builders/dashboard-builder';
export type { DashboardTemplate, DashboardPage, DashboardWidget } from './templates/standard-message-queue-dashboard';