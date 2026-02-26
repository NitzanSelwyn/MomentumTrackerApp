// Must import background task at global scope
import "../src/services/backgroundTask";

import { useEffect, useRef } from "react";
import { Slot } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { TOKEN_REFRESH_INTERVAL } from "../src/constants/config";
import { storeToken, deleteStoredToken } from "../src/services/tokenRefreshService";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

function TokenRefresher() {
  const { getToken, isSignedIn } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      deleteStoredToken();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const refreshToken = async () => {
      try {
        const token = await getToken({ template: "convex" });
        if (token) {
          await storeToken(token);
        }
      } catch (err) {
        console.error("Token refresh failed:", err);
      }
    };

    refreshToken();
    intervalRef.current = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isSignedIn, getToken]);

  return null;
}

function RootLayoutInner() {
  return (
    <>
      <TokenRefresher />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RootLayoutInner />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
