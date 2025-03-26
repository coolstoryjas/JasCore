import { useState, useEffect } from "react";
import { loadWallpaper, saveWallpaper } from "@/utils/storage";

export function useWallpaper() {
  const [currentWallpaper, setCurrentWallpaper] =
    useState<string>(loadWallpaper);

  // Listen for wallpaper changes in localStorage from other windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "control-panels:wallpaper") {
        setCurrentWallpaper(loadWallpaper());
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const setWallpaper = (path: string) => {
    // Update state immediately for the current window
    setCurrentWallpaper(path);
    // Save to localStorage for persistence and other windows
    saveWallpaper(path);
    // Dispatch a custom event for other components in the same window
    window.dispatchEvent(new CustomEvent("wallpaperChange", { detail: path }));
  };

  return {
    currentWallpaper,
    setWallpaper,
  };
}
