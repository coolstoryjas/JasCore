import { useState, useEffect, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ControlPanelsMenuBar } from "./ControlPanelsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WallpaperPicker } from "./WallpaperPicker";
import { AppProps } from "@/apps/base/types";
import {
  loadUISoundsEnabled,
  saveUISoundsEnabled,
  clearAllAppStates,
  loadSynthPreset,
  saveSynthPreset,
  loadTypingSynthEnabled,
  saveTypingSynthEnabled,
} from "@/utils/storage";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";

type PhotoCategory =
  | "3d_graphics"
  | "convergency"
  | "foliage"
  | "landscapes"
  | "nostalgia"
  | "objects"
  | "structures";

const PHOTO_WALLPAPERS: Record<PhotoCategory, string[]> = {
  "3d_graphics": [
    "capsule",
    "capsule_azul",
    "capsule_pistachio",
    "tub",
    "tub_azul",
    "tub_bondi",
    "ufo_1",
    "ufo_2",
    "ufo_3",
  ],
  convergency: Array.from({ length: 15 }, (_, i) => `convergence_${i + 1}`),
  foliage: [
    "blue_flowers",
    "cactus",
    "golden_poppy",
    "red_cyclamens",
    "red_tulips",
    "rose",
    "spider_lily",
    "waterdrops_on_leaf",
    "yellow_tulips",
  ],
  landscapes: [
    "beach",
    "clouds",
    "french_alps",
    "ganges_river",
    "golden_gate_at_dusk",
    "mono_lake",
    "palace_on_lake_in_jaipur",
    "rain_god_mesa",
    "refuge-col_de_la_grasse-alps",
    "zabriskie_point",
  ],
  nostalgia: [
    "acropolis",
    "beach_on_ko_samui",
    "birds_in_flight",
    "cancun_sunset",
    "cliffs_of_moher",
    "fish_eagle",
    "galway_bay",
    "glacier_national_park",
    "highway_395",
    "hong_kong_at_night",
    "islamorada_sunrise",
    "lily_pad",
    "long_island_sound",
    "mac_os_background",
    "midsummer_night",
    "moraine_lake",
    "oasis_in_baja",
    "red_clouds",
    "toronto_skyline",
    "tuolumne_meadows",
    "yosemite_valley",
    "yucatan",
  ],
  objects: [
    "alpine_granite",
    "bicycles",
    "bottles",
    "burmese_claypots",
    "burning_candle",
    "chairs",
    "faucet_handle",
    "neon",
    "salt_shaker_top",
    "shamus",
  ],
  structures: [
    "gate",
    "gate_lock",
    "glass_door_knob",
    "padlock",
    "rusty_lock",
    "shutters",
    "stone_wall",
    "wall_of_stones",
  ],
};

// Transform photo paths
Object.entries(PHOTO_WALLPAPERS).forEach(([category, photos]) => {
  PHOTO_WALLPAPERS[category as PhotoCategory] = photos.map(
    (name) => `/wallpapers/photos/${category}/${name}.jpg`
  );
});

export function ControlPanelsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const [uiSoundsEnabled, setUiSoundsEnabled] = useState(true);
  const [typingSynthEnabled, setTypingSynthEnabled] = useState(false);
  const [synthPreset, setSynthPreset] = useState("classic");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { formatFileSystem } = useFileSystem();

  useEffect(() => {
    setUiSoundsEnabled(loadUISoundsEnabled());
    setTypingSynthEnabled(loadTypingSynthEnabled());
    setSynthPreset(loadSynthPreset() || "classic");
  }, []);

  const handleUISoundsChange = (enabled: boolean) => {
    setUiSoundsEnabled(enabled);
    saveUISoundsEnabled(enabled);
  };

  const handleTypingSynthChange = (enabled: boolean) => {
    setTypingSynthEnabled(enabled);
    saveTypingSynthEnabled(enabled);
  };

  const handleSynthPresetChange = (value: string) => {
    setSynthPreset(value);
    saveSynthPreset(value);
    window.location.reload();
  };

  const handleResetAll = () => {
    setIsConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    clearAllAppStates();
    window.location.reload();
  };

  const handleBackup = async () => {
    const backup: {
      localStorage: Record<string, string | null>;
      timestamp: string;
    } = {
      localStorage: {},
      timestamp: new Date().toISOString(),
    };

    // Backup all localStorage data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup.localStorage[key] = localStorage.getItem(key);
      }
    }

    // Compress the data
    const jsonString = JSON.stringify(backup);
    const compressedData = await new Blob([jsonString])
      .arrayBuffer()
      .then((buffer) => {
        const stream = new Blob([buffer]).stream();
        const compressedStream = stream.pipeThrough(
          new CompressionStream("gzip")
        );
        return new Response(compressedStream).blob();
      });

    // Create and download compressed file
    const url = URL.createObjectURL(compressedData);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .split("T")
      .join("-")
      .slice(0, -5);
    a.download = `ryOS-backup-${timestamp}.gz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let data: string;

        if (file.name.endsWith(".gz")) {
          // Handle compressed file
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const decompressedStream = new Response(
            arrayBuffer
          ).body?.pipeThrough(new DecompressionStream("gzip"));

          if (!decompressedStream) {
            throw new Error("Failed to decompress backup file");
          }

          const decompressedResponse = new Response(decompressedStream);
          data = await decompressedResponse.text();
        } else {
          // Handle uncompressed JSON file for backward compatibility
          data = e.target?.result as string;
        }

        const backup = JSON.parse(data);

        // Restore localStorage data
        if (backup.localStorage) {
          Object.entries(backup.localStorage).forEach(([key, value]) => {
            if (value !== null) {
              localStorage.setItem(key, value as string);
            }
          });
        }

        window.location.reload();
      } catch (err) {
        alert("Failed to restore backup. Invalid backup file.");
        console.error("Backup restore failed:", err);
      }
    };

    if (file.name.endsWith(".gz")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  if (!isWindowOpen) return null;

  return (
    <>
      <ControlPanelsMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
      />
      <WindowFrame
        title="Control Panels"
        onClose={onClose}
        isForeground={isForeground}
        appId="control-panels"
      >
        <div className="flex flex-col h-full bg-[#E3E3E3] p-4 w-full">
          <Tabs defaultValue="appearance" className="w-full h-full">
            <TabsList className="flex w-full h-6 space-x-0.5 bg-[#E3E3E3] border-b border-[#808080] shadow-none">
              <TabsTrigger
                value="appearance"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] data-[state=active]:border-b-0 shadow-none! text-[16px]"
              >
                Appearance
              </TabsTrigger>
              <TabsTrigger
                value="sound"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] data-[state=active]:border-b-0 shadow-none! text-[16px]"
              >
                Sound
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] data-[state=active]:border-b-0 shadow-none! text-[16px]"
              >
                System
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="appearance"
              className="mt-0 p-4 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4 h-full">
                <WallpaperPicker />
              </div>
            </TabsContent>

            <TabsContent
              value="sound"
              className="mt-0 p-4 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>UI Sounds</Label>
                  <Switch
                    checked={uiSoundsEnabled}
                    onCheckedChange={handleUISoundsChange}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Typing Synth</Label>
                  <Switch
                    checked={typingSynthEnabled}
                    onCheckedChange={handleTypingSynthChange}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <Label>Chat synth</Label>
                    <Label className="text-[11px] text-gray-600 font-geneva-12 pr-1">
                      ryOS will restart to apply new settings
                    </Label>
                  </div>
                  <Select
                    value={synthPreset}
                    onValueChange={handleSynthPresetChange}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Select a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="system"
              className="mt-0 p-4 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="retro"
                      onClick={handleBackup}
                      className="flex-1"
                    >
                      Backup
                    </Button>
                    <Button
                      variant="retro"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      Restore
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleRestore}
                      accept=".json,.gz"
                      className="hidden"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    Backup or restore all app settings and documents.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={handleResetAll}
                    className="w-full"
                  >
                    Reset All Settings
                  </Button>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    This will clear all saved settings and restore default
                    states.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={() => setIsConfirmFormatOpen(true)}
                    className="w-full"
                  >
                    Format File System
                  </Button>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    This will clear all documents (except sample documents) and
                    images. ryOS will restart after format.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Control Panels"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
          onConfirm={handleConfirmReset}
          title="Reset All Settings"
          description="Are you sure you want to reset all settings? This will clear all saved settings and restore default states. ryOS will restart after reset."
        />
        <ConfirmDialog
          isOpen={isConfirmFormatOpen}
          onOpenChange={setIsConfirmFormatOpen}
          onConfirm={async () => {
            await formatFileSystem();
            window.location.reload();
          }}
          title="Format File System"
          description="Are you sure you want to format the file system? This will permanently delete all documents (except sample documents) and images. ryOS will restart after format."
        />
      </WindowFrame>
    </>
  );
}
