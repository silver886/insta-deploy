import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeploymentStore, type LogLine } from "../store/deployment.store";

export function useLogStream(id: string, sessionToken: string) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const addLogLine = useDeploymentStore((s) => s.addLogLine);
  const clearLogs = useDeploymentStore((s) => s.clearLogs);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id || !sessionToken) return;

    clearLogs();

    function connect() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/deployments/${id}/logs?token=${encodeURIComponent(sessionToken)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.addEventListener("log", (event) => {
        try {
          const data = JSON.parse(event.data) as LogLine & { stage?: string };
          addLogLine({
            timestamp: data.timestamp,
            message: data.message,
            stream: data.stream,
            stage: data.stage ?? null,
          });

          // When a tunnel becomes ready or protocol changes, immediately refetch deployment
          if (data.message.startsWith("Tunnel ready:")) {
            queryClient.invalidateQueries({ queryKey: ["deployment", id] });
          }
        } catch {
          addLogLine({
            timestamp: new Date().toISOString(),
            message: event.data,
            stream: "stdout",
            stage: null,
          });
        }
      });

      es.addEventListener("status", () => {
        // Status updates are handled by the polling query
      });

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setIsConnected(false);
    };
  }, [id, sessionToken, addLogLine, clearLogs, queryClient]);

  return { isConnected };
}
