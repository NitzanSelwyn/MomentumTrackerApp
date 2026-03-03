import { useEffect } from "react";
import { Slot, router } from "expo-router";
import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { View, ActivityIndicator, StyleSheet } from "react-native";

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureWorker = useMutation(api.workers.ensureWorker);

  useEffect(() => {
    if (isAuthenticated) {
      ensureWorker({ role: "worker" }).catch(console.error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/(auth)/sign-in");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
});
