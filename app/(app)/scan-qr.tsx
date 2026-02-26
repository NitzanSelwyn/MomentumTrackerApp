import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "expo-router";

const JOIN_CODE_REGEX = /^[A-Z2-9]{6}$/;

export default function ScanQRScreen() {
  const router = useRouter();
  const joinOrganization = useMutation(api.organizations.joinOrganization);

  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const orgLookup = useQuery(
    api.organizations.getOrganizationByJoinCode,
    scannedCode ? { joinCode: scannedCode } : "skip"
  );

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    const code = data.trim().toUpperCase();
    if (JOIN_CODE_REGEX.test(code) && code !== scannedCode) {
      setScannedCode(code);
    }
  };

  const handleJoin = async (code: string) => {
    setIsJoining(true);
    try {
      await joinOrganization({ joinCode: code });
      Alert.alert("Success", "You have joined the organization!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to join organization");
    } finally {
      setIsJoining(false);
    }
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (!JOIN_CODE_REGEX.test(code)) {
      Alert.alert("Invalid Code", "Enter a 6-character join code");
      return;
    }
    setScannedCode(code);
  };

  // Show confirmation when org is found
  if (scannedCode && orgLookup) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>Join Organization?</Text>
          <Text style={styles.confirmOrg}>{orgLookup.name}</Text>
          <Text style={styles.confirmCode}>Code: {scannedCode}</Text>
          <TouchableOpacity
            style={[styles.joinButton, isJoining && styles.buttonDisabled]}
            onPress={() => handleJoin(scannedCode)}
            disabled={isJoining}
          >
            <Text style={styles.joinButtonText}>
              {isJoining ? "Joining..." : "Join"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setScannedCode("")}
          >
            <Text style={styles.cancelButtonText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show "not found" if code was scanned but org doesn't exist
  if (scannedCode && orgLookup === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>Code Not Found</Text>
          <Text style={styles.confirmCode}>{scannedCode}</Text>
          <Text style={styles.errorText}>
            No organization found with this code.
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setScannedCode("")}
          >
            <Text style={styles.cancelButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan QR Code</Text>
      </View>

      {permission?.granted ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
        </View>
      ) : (
        <View style={styles.noCameraBox}>
          <Text style={styles.noCameraText}>
            Camera permission is required to scan QR codes.
          </Text>
          <TouchableOpacity
            style={styles.joinButton}
            onPress={requestPermission}
          >
            <Text style={styles.joinButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual code entry */}
      <View style={styles.manualSection}>
        <Text style={styles.manualLabel}>Or enter code manually:</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="6-char code"
            autoCapitalize="characters"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={handleManualSubmit}
          />
          <TouchableOpacity
            style={styles.manualButton}
            onPress={handleManualSubmit}
          >
            <Text style={styles.manualButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  backButton: {
    fontSize: 16,
    color: "#4A90D9",
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  noCameraBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  noCameraText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  manualSection: {
    padding: 16,
  },
  manualLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 4,
    backgroundColor: "#fff",
    textAlign: "center",
    color: "#1a1a1a",
  },
  manualButton: {
    backgroundColor: "#4A90D9",
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  manualButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  confirmBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  confirmOrg: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#4A90D9",
    marginBottom: 8,
  },
  confirmCode: {
    fontSize: 16,
    color: "#666",
    fontFamily: "monospace",
    letterSpacing: 2,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    color: "#dc3545",
    marginBottom: 24,
  },
  joinButton: {
    backgroundColor: "#28a745",
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 16,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#4A90D9",
    fontSize: 16,
    fontWeight: "600",
  },
});
