import { useQuery } from "@tanstack/react-query";
import { getDeployment, type DeploymentStatus } from "../lib/api";

const STOPPED_STATUSES: DeploymentStatus[] = ["expired", "failed", "stopped"];

export function useDeployment(id: string, sessionToken: string) {
  return useQuery({
    queryKey: ["deployment", id],
    queryFn: () => getDeployment(id, sessionToken),
    enabled: !!id && !!sessionToken,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling only for truly terminal statuses
      if (status && STOPPED_STATUSES.includes(status)) {
        return false;
      }
      // Keep polling during running (tunnels may still be setting up)
      return 3000;
    },
  });
}
