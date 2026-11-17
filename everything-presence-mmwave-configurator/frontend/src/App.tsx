import { mdiLoading } from '@mdi/js';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ingressAware } from './api/client';
import { createRoom } from './api/rooms';
import type { AppSettings, LiveState } from './api/types';
import { DebugRecordingPill } from './components/DebugRecordingPill';
import {
  Button,
  Icon,
  Note,
  ToastProvider,
  useToast,
} from './components/primitives';
import { AppShell } from './components/shell/AppShell';
import type { Presence } from './components/shell/TopBar';
import { AppDataProvider, useAppData } from './contexts/AppDataContext';
import { DeviceMappingsProvider } from './contexts/DeviceMappingsContext';
import {
  installDebugCapture,
  recordNavigation,
  recordWebSocketEvent,
  resumeDebugCaptureIfActive,
} from './debug/debugCapture';
import { RoomScreen } from './pages/RoomScreen';
import { RoomsScreen } from './pages/RoomsScreen';
import { SettingsPage } from './pages/SettingsPage';
import { WizardPage } from './pages/WizardPage';
import {
  homeRoute,
  type Route,
  resolveRedirect,
  roomRoute,
  useHash,
  useRoute,
} from './router';
import { NO_ZONES_MESSAGE } from './utils/roomNav';
import { roomSupportsZoneEditing } from './utils/zoneCapabilities';

function AppRoutes() {
  const {
    rooms,
    devices,
    profiles,
    settings,
    loading,
    error: loadError,
    refresh,
    addRoom,
    updateRoom: storeRoom,
    updateSettings,
  } = useAppData();
  const [route, navigate] = useRoute();
  const hash = useHash();
  const toast = useToast();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const lastRoomRouteRef = useRef<Route | null>(null);

  // Debug capture hooks are inert until a debug session is active; resume one
  // that was started before this page load.
  useEffect(() => {
    installDebugCapture();
    void resumeDebugCaptureIfActive();
  }, []);

  useEffect(() => {
    recordNavigation(hash);
  }, [hash]);

  const canEditZones = useCallback(
    (roomId: string) =>
      roomSupportsZoneEditing(
        rooms.find((room) => room.id === roomId),
        profiles,
      ),
    [profiles, rooms],
  );
  const home = useCallback(
    () =>
      homeRoute({
        roomIds: rooms.map((room) => room.id),
        defaultRoomId: settings?.defaultRoomId,
        wizardCompleted: Boolean(settings?.wizardCompleted),
      }),
    [rooms, settings?.defaultRoomId, settings?.wizardCompleted],
  );

  useEffect(() => {
    if (loading || !settings) return;
    const redirect = resolveRedirect(hash, {
      roomIds: rooms.map((room) => room.id),
      defaultRoomId: settings.defaultRoomId,
      wizardCompleted: settings.wizardCompleted,
      canEditZones,
    });
    if (!redirect) return;
    if (redirect.notice === 'missing-room')
      toast.show('That room no longer exists', { tone: 'warning' });
    if (redirect.notice === 'no-zones')
      toast.show(NO_ZONES_MESSAGE, { tone: 'info' });
    navigate(redirect.route, { replace: true });
  }, [canEditZones, hash, loading, navigate, rooms, settings, toast]);

  useEffect(() => {
    if (route.name !== 'room') return;
    lastRoomRouteRef.current = route;
    setSelectedRoomId(route.roomId);
  }, [route]);

  // Memoize selected room and profile to create stable references
  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId),
    [rooms, selectedRoomId],
  );
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId),
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    if (selectedRoom?.profileId) setSelectedProfileId(selectedRoom.profileId);
    else setSelectedProfileId((current) => current ?? profiles[0]?.id ?? null);
  }, [profiles, selectedRoom?.profileId]);

  const refreshLiveState = React.useCallback(async () => {
    if (!selectedRoom || !selectedRoom.deviceId || !selectedProfile) {
      setLiveState(null);
      return;
    }

    const mappingsParam = selectedRoom.entityMappings
      ? `&entityMappings=${encodeURIComponent(JSON.stringify(selectedRoom.entityMappings))}`
      : '';
    const restUrl = ingressAware(
      `api/live/${selectedRoom.deviceId}/state?profileId=${selectedProfile.id}${mappingsParam}`,
    );

    try {
      const res = await fetch(restUrl);
      if (!res.ok) {
        throw new Error('Failed to refresh live state');
      }
      const data = (await res.json()) as { state?: LiveState };
      setLiveState(data.state ?? null);
    } catch {
      // Keep the current live state if the refresh fails.
    }
  }, [selectedProfile, selectedRoom]);

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ deviceId?: string }>).detail;
      if (detail?.deviceId && detail.deviceId !== selectedRoom?.deviceId) {
        return;
      }
      void refreshLiveState();
    };

    window.addEventListener(
      'ep:refresh-live-state',
      handleRefresh as EventListener,
    );
    return () => {
      window.removeEventListener(
        'ep:refresh-live-state',
        handleRefresh as EventListener,
      );
    };
  }, [refreshLiveState, selectedRoom?.deviceId]);

  // WebSocket connection for real-time state updates (global)
  useEffect(() => {
    if (!selectedRoom || !selectedRoom.deviceId || !selectedProfile) {
      setLiveState(null);
      return;
    }

    // Construct WebSocket URL using ingress-aware path
    const httpPath = ingressAware('api/live/ws');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${httpPath}`;

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let shouldReconnect = true;

    const connect = () => {
      if (!shouldReconnect) {
        return;
      }
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          recordWebSocketEvent('open');
          setError(null);
          // Subscribe to device state changes
          ws?.send(
            JSON.stringify({
              type: 'subscribe',
              deviceId: selectedRoom.deviceId,
              profileId: selectedProfile.id,
              entityMappings: selectedRoom.entityMappings,
            }),
          );
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (
              (message.type === 'warning' || message.type === 'error') &&
              message.code === 'MAPPING_NOT_FOUND'
            ) {
              // Device has no entity mappings - user should run entity discovery
              console.warn('MAPPING_NOT_FOUND:', message.message);
              // Set error to prompt user to configure entity mappings
              setError(
                'Entity mappings not found. Please run entity discovery in the wizard to configure this device.',
              );
            } else if (message.type === 'subscribed') {
              // Check if mappings are available
              if (message.hasMappings === false) {
                console.warn('Device subscribed but no mappings available');
              }
              void refreshLiveState();
            } else if (message.type === 'state_update') {
              // Update live state with new entity value
              setLiveState((prev) => {
                if (!prev) return prev;

                const updated = { ...prev, timestamp: message.timestamp };
                const normalizedState =
                  typeof message.state === 'string'
                    ? message.state.toLowerCase()
                    : '';
                const isUnavailable =
                  normalizedState === 'unavailable' ||
                  normalizedState === 'unknown';
                const setAvailability = (key: string) => {
                  if (!updated.availability) {
                    updated.availability = {};
                  }
                  updated.availability[key] = isUnavailable
                    ? 'unavailable'
                    : 'ok';
                };
                const parseNumberValue = (): number | null => {
                  if (isUnavailable) return null;
                  const value = parseFloat(message.state);
                  return Number.isFinite(value) ? value : null;
                };
                const parseIntValue = (): number | null => {
                  if (isUnavailable) return null;
                  const value = parseInt(message.state, 10);
                  return Number.isFinite(value) ? value : null;
                };
                const entityKey =
                  typeof message.entityKey === 'string'
                    ? message.entityKey
                    : '';

                // Helper to check if entity matches a mapping or falls back to pattern
                const mappings = selectedRoom.entityMappings;
                const matchesEntity = (
                  mappedEntity: string | undefined,
                  ...fallbackPatterns: string[]
                ): boolean => {
                  if (mappedEntity) {
                    return message.entityId === mappedEntity;
                  }
                  // Only use fallback patterns for legacy rooms without mappings
                  if (!mappings) {
                    return fallbackPatterns.some((pattern) =>
                      message.entityId.includes(pattern),
                    );
                  }
                  return false;
                };

                // Helper to check zone occupancy entities from mappings
                const checkZoneOccupancy = (): {
                  matched: boolean;
                  zoneNum?: number;
                } => {
                  const entityKey =
                    typeof message.entityKey === 'string'
                      ? message.entityKey
                      : '';
                  for (
                    let zoneNum = 1;
                    zoneNum <= (selectedProfile.limits.maxZones ?? 4);
                    zoneNum += 1
                  ) {
                    const mappingKey = `zone${zoneNum}Occupancy`;
                    if (entityKey === mappingKey) {
                      return { matched: true, zoneNum };
                    }

                    const mappedEntity = (
                      mappings as Record<string, unknown> | undefined
                    )?.[mappingKey];
                    if (
                      typeof mappedEntity === 'string' &&
                      message.entityId === mappedEntity
                    ) {
                      return { matched: true, zoneNum };
                    }
                  }
                  return { matched: false };
                };

                // Helper to check target tracking entities from mappings
                const checkTargetEntity = (): {
                  matched: boolean;
                  targetId?: number;
                  field?: string;
                } => {
                  if (mappings?.trackingTargets) {
                    const targets = mappings.trackingTargets;
                    for (const [key, targetSet] of Object.entries(targets)) {
                      if (!targetSet) continue;
                      const targetNum = parseInt(key.replace('target', ''), 10);
                      if (targetSet.x && message.entityId === targetSet.x)
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'x',
                        };
                      if (targetSet.y && message.entityId === targetSet.y)
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'y',
                        };
                      if (
                        targetSet.speed &&
                        message.entityId === targetSet.speed
                      )
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'speed',
                        };
                      if (
                        targetSet.distance &&
                        message.entityId === targetSet.distance
                      )
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'distance',
                        };
                      if (
                        targetSet.angle &&
                        message.entityId === targetSet.angle
                      )
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'angle',
                        };
                      if (
                        targetSet.resolution &&
                        message.entityId === targetSet.resolution
                      )
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'resolution',
                        };
                      if (
                        targetSet.active &&
                        message.entityId === targetSet.active
                      )
                        return {
                          matched: true,
                          targetId: targetNum,
                          field: 'active',
                        };
                    }
                  }
                  // Target entities live in the device mapping, so a room without its own target set matches by pattern.
                  if (!mappings?.trackingTargets) {
                    const match = message.entityId.match(
                      /target_(\d+)_(x|y|distance|speed|angle|resolution|active)/,
                    );
                    if (match) {
                      return {
                        matched: true,
                        targetId: parseInt(match[1], 10),
                        field: match[2],
                      };
                    }
                  }
                  return { matched: false };
                };

                // Map entity_id to state field using entity mappings
                const zoneCheck = checkZoneOccupancy();
                if (zoneCheck.matched && zoneCheck.zoneNum) {
                  if (!updated.zoneOccupancy) {
                    updated.zoneOccupancy = {};
                  }
                  const key = `zone${zoneCheck.zoneNum}` as
                    | 'zone1'
                    | 'zone2'
                    | 'zone3'
                    | 'zone4';
                  updated.zoneOccupancy[key] = message.state === 'on';
                } else if (
                  matchesEntity(mappings?.presenceEntity, 'occupancy')
                ) {
                  setAvailability('presence');
                  if (!isUnavailable) {
                    updated.presence = message.state === 'on';
                  }
                } else if (
                  matchesEntity(
                    mappings?.distanceEntity,
                    'target_distance',
                    'mmwave_target_distance',
                  )
                ) {
                  setAvailability('distance');
                  updated.distance = parseNumberValue();
                } else if (
                  matchesEntity(
                    mappings?.speedEntity,
                    'target_speed',
                    'mmwave_target_speed',
                  )
                ) {
                  setAvailability('speed');
                  updated.speed = parseNumberValue();
                } else if (
                  matchesEntity(
                    mappings?.energyEntity,
                    'target_energy',
                    'mmwave_target_energy',
                  )
                ) {
                  setAvailability('energy');
                  updated.energy = parseIntValue();
                } else if (
                  matchesEntity(mappings?.targetCountEntity, 'target_count')
                ) {
                  setAvailability('targetCount');
                  updated.targetCount = parseIntValue() ?? 0;
                } else if (matchesEntity(mappings?.mmwaveEntity, '_mmwave')) {
                  // mmWave binary sensor - only match if it's actually the mmwave sensor entity
                  if (
                    !mappings?.mmwaveEntity ||
                    message.entityId === mappings.mmwaveEntity
                  ) {
                    setAvailability('mmwave');
                    if (!isUnavailable) {
                      updated.mmwave = message.state === 'on';
                    }
                  }
                } else if (matchesEntity(mappings?.pirEntity, '_pir')) {
                  setAvailability('pir');
                  if (!isUnavailable) {
                    updated.pir = message.state === 'on';
                  }
                } else if (
                  matchesEntity(mappings?.temperatureEntity, '_temperature')
                ) {
                  setAvailability('temperature');
                  updated.temperature = parseNumberValue();
                } else if (
                  matchesEntity(mappings?.humidityEntity, '_humidity')
                ) {
                  setAvailability('humidity');
                  updated.humidity = parseNumberValue();
                } else if (
                  matchesEntity(mappings?.illuminanceEntity, '_illuminance')
                ) {
                  setAvailability('illuminance');
                  updated.illuminance = parseNumberValue();
                } else if (matchesEntity(mappings?.co2Entity, '_co2')) {
                  setAvailability('co2');
                  updated.co2 = parseNumberValue();
                }

                // Handle config entities
                else if (matchesEntity(mappings?.modeEntity, 'mmwave_mode')) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('mode');
                  if (!isUnavailable) {
                    updated.config!.mode = message.state as any;
                  }
                } else if (
                  matchesEntity(
                    mappings?.maxDistanceEntity,
                    'max_distance',
                    'tracking_detection_range',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('distanceMax');
                  updated.config!.distanceMax = parseNumberValue();
                } else if (
                  entityKey === 'installationAngleEntity' ||
                  matchesEntity(
                    mappings?.installationAngleEntity,
                    'installation_angle',
                    'tracking_sensor_angle',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('installationAngle');
                  updated.config!.installationAngle =
                    parseNumberValue() ?? undefined;
                } else if (
                  entityKey === 'upsideDownMountingEntity' ||
                  matchesEntity(
                    mappings?.upsideDownMountingEntity,
                    'upside_down_mounting',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('upsideDownMounting');
                  updated.config!.upsideDownMounting = message.state === 'on';
                }
                // Settings entities that may not have dedicated mappings yet - use settingsEntities
                else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveDistanceMin,
                    'distance_min',
                    'mmwave_minimum_distance',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('distanceMin');
                  updated.config!.distanceMin = parseNumberValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveTriggerDistance,
                    'trigger_distance',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('triggerDistance');
                  updated.config!.triggerDistance = parseNumberValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveSensitivity,
                    'sustain_sensitivity',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('sensitivity');
                  updated.config!.sensitivity = parseIntValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveTriggerSensitivity,
                    'trigger_sensitivity',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('triggerSensitivity');
                  updated.config!.triggerSensitivity = parseIntValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveOffLatency,
                    'off_latency',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('offLatency');
                  updated.config!.offLatency = parseIntValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveOnLatency,
                    'on_latency',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('onLatency');
                  updated.config!.onLatency = parseIntValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.mmwaveThresholdFactor,
                    'threshold_factor',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('thresholdFactor');
                  updated.config!.thresholdFactor = parseIntValue();
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.microMotion,
                    'micro_motion',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('microMotion');
                  if (!isUnavailable) {
                    updated.config!.microMotionEnabled = message.state === 'on';
                  }
                } else if (
                  matchesEntity(
                    mappings?.settingsEntities?.updateRate,
                    'update_rate',
                  )
                ) {
                  if (!updated.config) updated.config = {} as any;
                  setAvailability('updateRate');
                  if (!isUnavailable) {
                    updated.config!.updateRate = message.state || null;
                  }
                }

                // Handle target tracking entities using mappings
                else {
                  const targetCheck = checkTargetEntity();
                  if (
                    targetCheck.matched &&
                    targetCheck.targetId &&
                    targetCheck.field
                  ) {
                    const { targetId, field } = targetCheck;

                    if (field === 'active') {
                      if (!updated.targets) {
                        updated.targets = [];
                      }
                      let target = updated.targets.find(
                        (t) => t.id === targetId,
                      );
                      if (!target) {
                        target = { id: targetId, x: null, y: null };
                        updated.targets.push(target);
                      }
                      target.active = message.state === 'on';
                    } else {
                      // Initialize targets array if needed
                      if (!updated.targets) {
                        updated.targets = [];
                      }

                      // Find or create target
                      let target = updated.targets.find(
                        (t) => t.id === targetId,
                      );
                      if (!target) {
                        target = { id: targetId, x: null, y: null };
                        updated.targets.push(target);
                      }

                      // Update field with unit conversion for coordinates/distances
                      let value = parseFloat(message.state);
                      if (!isNaN(value)) {
                        // Convert imperial units to mm if needed (for x, y, distance fields)
                        if (
                          (field === 'x' ||
                            field === 'y' ||
                            field === 'distance') &&
                          message.attributes?.unit_of_measurement
                        ) {
                          const unit = message.attributes
                            .unit_of_measurement as string;
                          const unitLower = unit.toLowerCase();
                          // Convert inches to mm (1 inch = 25.4 mm)
                          if (
                            unitLower === 'in' ||
                            unitLower === 'inch' ||
                            unitLower === 'inches' ||
                            unitLower === '"'
                          ) {
                            value = value * 25.4;
                          }
                          // Convert feet to mm (1 foot = 304.8 mm)
                          else if (
                            unitLower === 'ft' ||
                            unitLower === 'foot' ||
                            unitLower === 'feet' ||
                            unitLower === "'"
                          ) {
                            value = value * 304.8;
                          }
                          // Convert cm to mm
                          else if (unitLower === 'cm') {
                            value = value * 10;
                          }
                          // Convert m to mm
                          else if (unitLower === 'm') {
                            value = value * 1000;
                          }
                        }
                        (target as any)[field] = value;
                      } else {
                        (target as any)[field] = null;
                      }
                    }
                  }
                  // Handle assumed presence status (entry/exit feature)
                  else if (
                    entityKey === 'assumedPresentRemaining' ||
                    matchesEntity(
                      mappings?.assumedPresentRemainingEntity,
                      'assumed_present_remaining',
                    )
                  ) {
                    const value = parseFloat(message.state);
                    updated.assumedPresentRemaining = !isNaN(value)
                      ? value
                      : undefined;
                  } else if (
                    entityKey === 'assumedPresent' ||
                    matchesEntity(
                      mappings?.assumedPresentEntity,
                      'assumed_present',
                    )
                  ) {
                    updated.assumedPresent = message.state === 'on';
                  }
                }

                return updated;
              });
            } else if (message.type === 'error') {
              console.error('WebSocket error:', message.error);
              setError(message.error);
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          recordWebSocketEvent('error');
          console.error('WebSocket error:', error);
          setError(
            'WebSocket connection error. Falling back to REST polling...',
          );
        };

        ws.onclose = (event) => {
          recordWebSocketEvent(
            'close',
            `code ${event.code}${event.reason ? ` ${event.reason}` : ''}`,
          );
          ws = null;
          if (shouldReconnect) {
            recordWebSocketEvent('reconnect', 'retrying in 3s');
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setError('Failed to establish WebSocket connection');
        // Fallback to REST polling
        if (shouldReconnect) {
          recordWebSocketEvent(
            'reconnect',
            'retrying in 3s after connection failure',
          );
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.close();
      }
    };
    // Depend on memoized room/profile objects - only changes when the actual objects change
  }, [refreshLiveState, selectedRoom, selectedProfile]);

  // Transform device-relative coordinates to room coordinates
  const installationAngle =
    typeof liveState?.config?.installationAngle === 'number'
      ? liveState.config.installationAngle
      : 0;
  const deviceToRoom = React.useCallback(
    (deviceX: number, deviceY: number) => {
      if (!selectedRoom?.devicePlacement) {
        return { x: deviceX, y: deviceY };
      }

      const { x, y, rotationDeg } = selectedRoom.devicePlacement;
      const effectiveRotationDeg = (rotationDeg ?? 0) + installationAngle;
      const angleRad = (effectiveRotationDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      // Orientation (upside-down mounting) is normalised on-device by the firmware,
      // so Target X is already in the correct frame here — do not re-flip it.
      const localX = deviceX;

      const rotatedX = localX * cos - deviceY * sin;
      const rotatedY = localX * sin + deviceY * cos;

      return {
        x: rotatedX + x,
        y: rotatedY + y,
      };
    },
    [selectedRoom, installationAngle],
  );

  // Compute target positions in room coordinates
  const targetPositions = useMemo(() => {
    if (!liveState?.targets) return [];
    return liveState.targets
      .filter((t) => {
        // Skip if coordinates are null
        if (t.x === null || t.y === null) return false;
        // Treat live coordinates as the source of truth. Some devices can report
        // stale target_N_active values while x/y continue updating correctly.
        if (t.x === 0 && t.y === 0 && t.active !== true) return false;
        return true;
      })
      .map((t) => {
        const roomPos = deviceToRoom(t.x!, t.y!);
        return {
          id: t.id,
          x: roomPos.x,
          y: roomPos.y,
          distance: t.distance ?? null,
          speed: t.speed ?? null,
          angle: t.angle ?? null,
        };
      });
  }, [liveState, deviceToRoom]);

  const presence: Presence | null =
    !selectedRoom?.deviceId || !liveState
      ? null
      : liveState.availability?.presence === 'unavailable'
        ? 'offline'
        : liveState.presence
          ? 'occupied'
          : 'clear';

  const saveProgress = useCallback(
    (patch: Partial<AppSettings>) => {
      updateSettings(patch).catch(() => null);
    },
    [updateSettings],
  );

  const startWizard = useCallback(() => {
    saveProgress({
      wizardStep: 'device',
      wizardDeviceId: null,
      wizardProfileId: null,
    });
    navigate({ name: 'wizard' });
  }, [navigate, saveProgress]);

  const openRoom = (
    roomId: string | null,
    mode: 'live' | 'zones' | 'build',
  ) => {
    const target = roomId ?? selectedRoomId;
    navigate(target ? roomRoute(target, mode) : home());
  };


  const renderScreen = () => {
    if (loading) {
      return (
        <div
          className="flex h-full items-center justify-center text-fg-muted"
          role="status"
        >
          <Icon
            path={mdiLoading}
            size={24}
            className="animate-spin"
            label="Loading"
          />
        </div>
      );
    }
    if (loadError && rooms.length === 0) {
      return (
        <div className="mx-auto max-w-md p-6">
          <Note
            tone="danger"
            title="Could not load your rooms"
            actions={
              <Button size="sm" onClick={() => void refresh()}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Note>
        </div>
      );
    }
    switch (route.name) {
      case 'room': {
        if (!rooms.some((room) => room.id === route.roomId)) return null;
        return (
          <RoomScreen
            roomId={route.roomId}
            mode={route.mode}
            liveState={liveState}
            targetPositions={targetPositions}
            onWizardZonesReady={() =>
              saveProgress({ zonesReady: true, wizardStep: 'finish' })
            }
            onWizardProgress={(p) => {
              if (p.outlineDone)
                saveProgress({ outlineDone: true, wizardStep: 'placement' });
              if (p.placementDone)
                saveProgress({ placementDone: true, wizardStep: 'zones' });
            }}
          />
        );
      }
      case 'settings':
        return <SettingsPage section={route.section} />;
      case 'rooms':
        return (
          <RoomsScreen
            onAddDevice={startWizard}
            live={selectedRoomId && presence ? { roomId: selectedRoomId, presence } : null}
          />
        );
      case 'wizard':
        return (
          <div className="p-4">
            <WizardPage
              devices={devices}
              profiles={profiles}
              rooms={rooms}
              selectedDeviceId={settings?.wizardDeviceId ?? undefined}
              selectedProfileId={settings?.wizardProfileId ?? selectedProfileId}
              onBack={() => {
                saveProgress({
                  wizardStep: 'device',
                  wizardDeviceId: null,
                  wizardProfileId: null,
                });
                navigate(home());
              }}
              onCreateRoom={async (
                name,
                deviceId,
                profileId,
                entityMappings,
              ) => {
                // Find the selected device to get its entityNamePrefix (legacy fallback)
                const selectedDevice = deviceId
                  ? devices.find((d) => d.id === deviceId)
                  : undefined;
                const result = await createRoom({
                  name,
                  deviceId: deviceId || undefined,
                  entityNamePrefix: selectedDevice?.entityNamePrefix,
                  entityMappings: entityMappings,
                  profileId: profileId || undefined,
                  units: 'metric',
                  zones: [],
                });
                addRoom(result.room);
                return result.room;
              }}
              onSelectRoom={(roomId, profileId) => {
                setSelectedRoomId(roomId);
                if (profileId) setSelectedProfileId(profileId);
              }}
              onGoRoomBuilder={(roomId, profileId) => {
                if (profileId) setSelectedProfileId(profileId);
                openRoom(roomId, 'build');
              }}
              onGoZoneEditor={(roomId, profileId) => {
                if (profileId) setSelectedProfileId(profileId);
                // The router redirect has the final say: a room without zones lands on Live.
                openRoom(roomId, 'zones');
              }}
              onRoomUpdate={storeRoom}
              onComplete={() => {
                saveProgress({
                  wizardCompleted: true,
                  wizardStep: 'finish',
                  wizardDeviceId: null,
                  wizardProfileId: null,
                });
                openRoom(null, 'live');
              }}
              initialStep={settings?.wizardStep ?? 'device'}
              onStepChange={(key) => {
                saveProgress({ wizardStep: key });
              }}
              onSelectionChange={(deviceId, profileId) => {
                saveProgress({
                  wizardDeviceId: deviceId,
                  wizardProfileId: profileId,
                });
              }}
              outlineDone={Boolean(settings?.outlineDone)}
              placementDone={Boolean(settings?.placementDone)}
              zonesReady={Boolean(settings?.zonesReady)}
              setOutlineDone={(val) => {
                saveProgress({ outlineDone: val });
              }}
              setPlacementDone={(val) => {
                saveProgress({ placementDone: val });
              }}
              setZonesReady={(val) => {
                saveProgress({ zonesReady: val });
              }}
              liveState={liveState}
              targetPositions={targetPositions}
            />
          </div>
        );
    }
  };

  return (
    <AppShell
      route={route}
      lastRoomId={selectedRoomId}
      presence={presence}
      onAddDevice={startWizard}
    >
      {renderScreen()}
      <DebugRecordingPill />
    </AppShell>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppDataProvider>
        <DeviceMappingsProvider>
          <AppRoutes />
        </DeviceMappingsProvider>
      </AppDataProvider>
    </ToastProvider>
  );
}

export default App;
