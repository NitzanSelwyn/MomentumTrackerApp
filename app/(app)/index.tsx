import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  AppState,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useLocationPermissions } from "../../src/hooks/useLocationPermissions";
import { useLocationTracking } from "../../src/hooks/useLocationTracking";
import { useBatteryLevel } from "../../src/hooks/useBatteryLevel";
import { useCommandSound } from "../../src/hooks/useCommandSound";
import { deleteStoredToken } from "../../src/services/tokenRefreshService";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { BACKGROUND_LOCATION_TASK } from "../../src/constants/config";

export default function HomeScreen() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const router = useRouter();

  // Worker data from Convex
  const myWorker = useQuery(api.workerApp.getMyWorker);
  const orgSettings = useQuery(api.organizations.getMyOrgSettings);
  const pendingCommands = useQuery(api.commands.getPendingCommands);

  const toggleDuty = useMutation(api.workerApp.toggleMyDuty);
  const updateLocation = useMutation(api.workerApp.updateLocationWithHistory);
  const markAcknowledged = useMutation(api.commands.markAcknowledged);
  const updateMyName = useMutation(api.workerApp.updateMyName);

  useCommandSound(pendingCommands);
  const { requestPermissions, checkPermissions } = useLocationPermissions();
  const { startTracking, stopTracking } = useLocationTracking();
  const { batteryLevel, batteryStateLabel } = useBatteryLevel();

  const [isToggling, setIsToggling] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const nameInputRef = useRef<TextInput>(null);

  const isOnDuty = myWorker?.isOnDuty ?? false;
  const hasOrg = !!myWorker?.organizationId;

  // Re-check permissions when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);

  // Sync shift state on mount if background task is already running
  useEffect(() => {
    if (!myWorker) return;
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .then((running) => {
        if (running && !isOnDuty) {
          toggleDuty({ isOnDuty: true });
        }
      })
      .catch(() => {});
  }, [myWorker?._id]);

  const handleForegroundLocation = useCallback(
    async (location: Location.LocationObject) => {
      const level = batteryLevel != null ? Math.round(batteryLevel * 100) : undefined;
      const isCharging = batteryStateLabel === "CHARGING" ? true : undefined;

      try {
        await updateLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          batteryLevel: level,
          isCharging,
        });
      } catch (err) {
        console.error("Failed to update location:", err);
      }
    },
    [batteryLevel, batteryStateLabel, updateLocation]
  );

  const handleToggleShift = async () => {
    if (!myWorker || isToggling) return;
    setIsToggling(true);

    try {
      if (!isOnDuty) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            "Permissions Required",
            "Background location permission is needed to track your location during shifts. Please enable it in Settings."
          );
          setIsToggling(false);
          return;
        }
        await toggleDuty({ isOnDuty: true });
        await startTracking(handleForegroundLocation, orgSettings?.locationIntervalMs);
      } else {
        await stopTracking();
        await toggleDuty({ isOnDuty: false });
      }
    } catch (err) {
      console.error("Failed to toggle shift:", err);
      Alert.alert("Error", "Failed to toggle shift. Please try again.");
    } finally {
      setIsToggling(false);
    }
  };

  const handleAcknowledge = async (commandId: any) => {
    try {
      await markAcknowledged({ commandId });
    } catch (err) {
      console.error("Failed to acknowledge command:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      if (isOnDuty) {
        await stopTracking();
        await toggleDuty({ isOnDuty: false });
      }
      await deleteStoredToken();
      await signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  if (!myWorker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MomentumTracker</Text>
          {isEditingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                ref={nameInputRef}
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={async () => {
                  const trimmed = editedName.trim();
                  if (trimmed && trimmed !== myWorker.name) {
                    await updateMyName({ name: trimmed });
                  }
                  setIsEditingName(false);
                }}
              />
              <TouchableOpacity
                style={styles.nameEditButton}
                onPress={async () => {
                  const trimmed = editedName.trim();
                  if (trimmed && trimmed !== myWorker.name) {
                    await updateMyName({ name: trimmed });
                  }
                  setIsEditingName(false);
                }}
              >
                <Text style={styles.nameEditButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameEditButton, styles.nameEditCancel]}
                onPress={() => setIsEditingName(false)}
              >
                <Text style={styles.nameEditCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setEditedName(myWorker.name || "");
                setIsEditingName(true);
              }}
            >
              <Text style={styles.headerSubtitle}>
                {myWorker.name || myWorker.email} ✏️
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Organization Status */}
        {!hasOrg && (
          <TouchableOpacity
            style={styles.orgBanner}
            onPress={() => router.push("/(app)/scan-qr")}
          >
            <Text style={styles.orgBannerText}>
              Scan QR Code to Join Organization
            </Text>
          </TouchableOpacity>
        )}

        {/* Shift Status & Toggle */}
        <View style={[styles.statusBanner, isOnDuty ? styles.statusOn : styles.statusOff]}>
          <Text style={styles.statusText}>
            {isOnDuty ? "ON SHIFT" : "OFF SHIFT"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.shiftButton,
            isOnDuty ? styles.shiftButtonStop : styles.shiftButtonStart,
            isToggling && styles.shiftButtonDisabled,
          ]}
          onPress={handleToggleShift}
          disabled={isToggling}
        >
          <Text style={styles.shiftButtonText}>
            {isToggling ? "..." : isOnDuty ? "End Shift" : "Start Shift"}
          </Text>
        </TouchableOpacity>

        {/* Admin Messages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Messages from Admin</Text>
          {!pendingCommands || pendingCommands.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No new messages</Text>
            </View>
          ) : (
            pendingCommands.map((cmd) => (
              <View key={cmd._id} style={styles.messageCard}>
                <View style={styles.messageHeader}>
                  <Text style={styles.messageType}>
                    {cmd.type === "sound_alert"
                      ? "Alert"
                      : cmd.type === "message"
                      ? "Message"
                      : "Alert + Message"}
                  </Text>
                  <Text style={styles.messageTime}>
                    {new Date(cmd.createdAt).toLocaleTimeString()}
                  </Text>
                </View>
                {cmd.message ? (
                  <Text style={styles.messageBody}>{cmd.message}</Text>
                ) : null}
                <TouchableOpacity
                  style={styles.ackButton}
                  onPress={() => handleAcknowledge(cmd._id)}
                >
                  <Text style={styles.ackButtonText}>Acknowledge</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  header: {
    marginBottom: 20,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
    color: "#1a1a1a",
  },
  nameEditButton: {
    backgroundColor: "#4A90D9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nameEditButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  nameEditCancel: {
    backgroundColor: "#e0e0e0",
  },
  nameEditCancelText: {
    color: "#666",
    fontWeight: "600",
    fontSize: 14,
  },
  orgBanner: {
    backgroundColor: "#4A90D9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  orgBannerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  statusBanner: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  statusOn: {
    backgroundColor: "#d4edda",
  },
  statusOff: {
    backgroundColor: "#f8d7da",
  },
  statusText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  shiftButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
  },
  shiftButtonStart: {
    backgroundColor: "#28a745",
  },
  shiftButtonStop: {
    backgroundColor: "#dc3545",
  },
  shiftButtonDisabled: {
    opacity: 0.7,
  },
  shiftButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  messageCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  messageType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A90D9",
  },
  messageTime: {
    fontSize: 12,
    color: "#999",
  },
  messageBody: {
    fontSize: 15,
    color: "#333",
    marginBottom: 12,
  },
  ackButton: {
    backgroundColor: "#4A90D9",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  ackButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: "#dc3545",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
