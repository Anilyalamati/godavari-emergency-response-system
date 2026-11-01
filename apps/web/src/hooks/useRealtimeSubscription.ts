import { useEffect, useRef, useState, useCallback } from 'react';
import { supabaseClient } from '../auth/authClient.js';

export type RealtimeConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';

export interface UseRealtimeSubscriptionOptions {
  enabled?: boolean;
  sessionToken?: string | null;
  onUpdate: () => void;
}

export interface UseRealtimeSubscriptionResult {
  connectionStatus: RealtimeConnectionStatus;
  reconnect: () => void;
  lastEventTimestamp: string | null;
}

export function useRealtimeSubscription({
  enabled = true,
  sessionToken,
  onUpdate,
}: UseRealtimeSubscriptionOptions): UseRealtimeSubscriptionResult {
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('CONNECTING');
  const [lastEventTimestamp, setLastEventTimestamp] = useState<string | null>(null);
  const wasDisconnectedRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const reconnect = useCallback(() => {
    setReconnectTrigger((prev) => prev + 1);
    onUpdateRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || !supabaseClient) {
      setConnectionStatus('DISCONNECTED');
      return;
    }

    setConnectionStatus('CONNECTING');

    if (sessionToken) {
      supabaseClient.realtime.setAuth(sessionToken);
    }

    // Use a unique channel topic per mount / reconnect trigger to avoid collision
    const channelName = `operational-realtime-${Date.now()}`;
    const channel = supabaseClient.channel(channelName);

    const handleDataChange = () => {
      setLastEventTimestamp(new Date().toISOString());
      onUpdateRef.current();
    };

    // Explicitly listen to permitted operational tables ONLY.
    // reporter_contacts and tracking tokens are strictly excluded from the publication.
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        handleDataChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments' },
        handleDataChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_events' },
        handleDataChange,
      );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('CONNECTED');
        if (wasDisconnectedRef.current) {
          // Reconnection restores correct authoritative state by refetching
          onUpdateRef.current();
          wasDisconnectedRef.current = false;
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnectionStatus('DISCONNECTED');
        wasDisconnectedRef.current = true;
      }
    });

    return () => {
      void channel.unsubscribe();
      void supabaseClient?.removeChannel(channel);
    };
  }, [enabled, sessionToken, reconnectTrigger]);

  return {
    connectionStatus,
    reconnect,
    lastEventTimestamp,
  };
}
