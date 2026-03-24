import type { UserRole } from '../auth/auth.repository';

const roleOrder = ['monitor', 'trader', 'executor', 'institutional', 'admin'] as const;

const hasMinimumRole = (role: UserRole, minimumRole: UserRole) =>
  roleOrder.indexOf(role) >= roleOrder.indexOf(minimumRole);

export const isOpportunityChannel = (channel: string) => /^opportunities:\d+$/.test(channel);
export const isTradesLiveChannel = (channel: string) => channel === 'trades:live';
export const isSystemAlertsChannel = (channel: string) => channel === 'system:alerts';

export const canAccessOpportunities = (role: UserRole) => hasMinimumRole(role, 'trader');

export const canAccessLiveChannel = (role: UserRole, channel: string) => {
  if (isOpportunityChannel(channel)) {
    return canAccessOpportunities(role);
  }

  if (isTradesLiveChannel(channel) || isSystemAlertsChannel(channel)) {
    return hasMinimumRole(role, 'monitor');
  }

  return false;
};

export const filterAuthorizedChannels = (role: UserRole, channels: string[]) =>
  channels.filter((channel) => canAccessLiveChannel(role, channel));
