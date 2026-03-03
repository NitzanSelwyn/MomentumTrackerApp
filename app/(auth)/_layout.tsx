import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(app)");
    }
  }, [isSignedIn, isLoaded]);

  if (!isLoaded || isSignedIn) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
