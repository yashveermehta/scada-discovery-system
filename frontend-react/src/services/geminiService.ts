// simple heuristic-based security check
// originally planned to hook this up to gemini api but 
// decided to keep it offline for now since scada networks 
// shouldnt be calling external apis anyway

import type { Alert, TopologyData } from '../types';

export const analyzeSecurityStatus = async (
  topology: TopologyData,
  alerts: Alert[]
): Promise<string> => {
  const totalDevices = topology.nodes.length;
  const totalLinks = topology.links.length;
  const unauthorized = topology.nodes.filter((n) => !n.isAuthorized).length;
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;

  // just building a text summary, nothing fancy
  return (
    `Security Analysis (Local Heuristics)\n\n` +
    `Current Status:\n` +
    `- Devices: ${totalDevices}\n` +
    `- Connections: ${totalLinks}\n` +
    `- Unauthorized Devices: ${unauthorized}\n` +
    `- Active Alerts: ${alerts.length} (critical: ${criticalAlerts})\n\n` +
    `Observations:\n` +
    `- Network appears ${criticalAlerts > 0 || unauthorized > 0 ? 'at risk' : 'stable'} based on current telemetry.\n` +
    (unauthorized > 0
      ? `- Detected ${unauthorized} device(s) marked as unauthorized.\n`
      : `- No devices are currently marked as unauthorized.\n`) +
    (criticalAlerts > 0
      ? `- There are ${criticalAlerts} critical alert(s) that require immediate review.\n`
      : `- No critical alerts are present.\n`) +
    `\nRecommended Next Actions:\n` +
    `1. Review unauthorized devices and either remove them or explicitly authorize them.\n` +
    `2. Investigate critical alerts and correlate with recent topology changes.\n` +
    `3. Ensure SNMPv3 credentials and EIGRP authentication are configured consistently.\n` +
    `4. Regularly export and back up topology data for audit and compliance.\n`
  );
};
