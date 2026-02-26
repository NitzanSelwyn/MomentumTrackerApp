import * as SecureStore from "expo-secure-store";
import { SECURE_STORE_KEYS } from "../constants/config";

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.CLERK_JWT, token);
}

export async function getStoredToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(SECURE_STORE_KEYS.CLERK_JWT);
}

export async function deleteStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.CLERK_JWT);
}
