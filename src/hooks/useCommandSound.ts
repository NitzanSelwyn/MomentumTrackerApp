import { useEffect, useRef } from "react";
import { Audio } from "expo-av";

type SoundType = "notification" | "alarm" | "urgent";
type CommandType = "sound_alert" | "message" | "sound_and_message";

interface PendingCommand {
  _id: string;
  type: CommandType;
  soundType: SoundType;
}

function generateWavDataUri(
  frequency: number,
  durationSec: number,
  volume: number
): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Generate tone samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t);

    // Apply fade in/out to avoid clicks
    const fadeLen = Math.min(0.01 * sampleRate, numSamples / 4);
    if (i < fadeLen) sample *= i / fadeLen;
    if (i > numSamples - fadeLen) sample *= (numSamples - i) / fadeLen;

    const val = Math.max(-1, Math.min(1, sample * volume));
    view.setInt16(44 + i * 2, val * 0x7fff, true);
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function getSoundParams(soundType: SoundType): {
  frequency: number;
  duration: number;
  volume: number;
  isLooping: boolean;
} {
  switch (soundType) {
    case "notification":
      return { frequency: 440, duration: 0.3, volume: 0.6, isLooping: false };
    case "alarm":
      return { frequency: 880, duration: 0.8, volume: 1.0, isLooping: false };
    case "urgent":
      return { frequency: 660, duration: 1.0, volume: 1.0, isLooping: true };
  }
}

export function useCommandSound(
  pendingCommands: PendingCommand[] | undefined
) {
  const playedIds = useRef(new Set<string>());
  const activeSounds = useRef<Audio.Sound[]>([]);

  // Configure audio mode once
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const sound of activeSounds.current) {
        sound.unloadAsync().catch(() => {});
      }
      activeSounds.current = [];
    };
  }, []);

  useEffect(() => {
    if (!pendingCommands) return;

    for (const cmd of pendingCommands) {
      // Only play sound for sound-based commands
      if (cmd.type === "message") continue;
      if (playedIds.current.has(cmd._id)) continue;

      playedIds.current.add(cmd._id);

      const params = getSoundParams(cmd.soundType);
      const uri = generateWavDataUri(
        params.frequency,
        params.duration,
        params.volume
      );

      (async () => {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri },
            {
              shouldPlay: true,
              isLooping: params.isLooping,
              volume: params.volume,
            }
          );
          activeSounds.current.push(sound);

          if (params.isLooping) {
            // Auto-stop looping sounds after 10 seconds
            setTimeout(async () => {
              try {
                await sound.stopAsync();
                await sound.unloadAsync();
              } catch {}
              activeSounds.current = activeSounds.current.filter(
                (s) => s !== sound
              );
            }, 10_000);
          } else {
            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) {
                sound.unloadAsync().catch(() => {});
                activeSounds.current = activeSounds.current.filter(
                  (s) => s !== sound
                );
              }
            });
          }
        } catch (err) {
          console.warn("Failed to play command sound:", err);
        }
      })();
    }

    // When commands are acknowledged (removed from pending), stop all active sounds
    if (pendingCommands.length === 0 && activeSounds.current.length > 0) {
      for (const sound of activeSounds.current) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
      }
      activeSounds.current = [];
    }
  }, [pendingCommands]);
}
