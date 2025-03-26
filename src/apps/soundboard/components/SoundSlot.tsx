import { Button } from "@/components/ui/button";
import { SoundSlot as SoundSlotType } from "@/types/types";
import { Trash2 } from "lucide-react";
import { Waveform } from "./Waveform";
import type WaveSurfer from "wavesurfer.js";

interface SoundSlotProps {
  slot: SoundSlotType;
  isRecording: boolean;
  isPlaying: boolean;
  waveformRef: (el: HTMLDivElement | null) => void;
  onSlotClick: () => void;
  onDelete: () => void;
  onEmojiClick: () => void;
  onTitleClick: () => void;
  onWaveformCreate?: (waveform: WaveSurfer) => void;
  showWaveform: boolean;
  showEmoji: boolean;
}

export function SoundSlot({
  slot,
  isRecording,
  isPlaying,
  waveformRef,
  onSlotClick,
  onDelete,
  onEmojiClick,
  onTitleClick,
  onWaveformCreate,
  showWaveform,
  showEmoji,
}: SoundSlotProps) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <Button
        variant="retro"
        className={`h-full w-full flex flex-col items-stretch justify-between relative p-2 md:p-2 group min-h-[106px] md:min-h-[110px] focus:outline-none focus:ring-0 ${
          isRecording ? "bg-destructive animate-pulse" : ""
        } ${
          isPlaying
            ? "[border-image:url('/button-default.svg')_60_stretch]"
            : ""
        }`}
        onClick={onSlotClick}
      >
        {slot.audioData && showWaveform && (
          <>
            <Waveform
              ref={waveformRef}
              audioData={slot.audioData}
              isPlaying={isPlaying}
              onWaveformCreate={onWaveformCreate}
              className="z-10"
            />
            <div className="absolute top-1 right-1 flex gap-1 z-10">
              <div
                role="button"
                className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 md:h-6 md:w-6 hover:bg-white/50 rounded-md items-center justify-center cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
              </div>
            </div>
          </>
        )}
        <div
          className={`mb-[-4px] left-2 flex items-center gap-1 md:gap-2 transition-all duration-300 ease-in-out transform origin-left ${
            isPlaying ? "opacity-100 scale-100" : "opacity-60 scale-80"
          }`}
        >
          {showEmoji &&
            (slot.emoji ? (
              <span
                className="text-xl md:text-2xl cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  onEmojiClick();
                }}
              >
                {slot.emoji}
              </span>
            ) : (
              <span
                role="button"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-xl md:text-2xl cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  onEmojiClick();
                }}
              >
                {slot.audioData ? "💿" : "🎙️"}
              </span>
            ))}
          <span
            className="text-[14px] truncate max-w-[80px] md:max-w-[120px] cursor-text hover:bg-white/20 px-1 rounded select-text font-geneva-12"
            onClick={(e) => {
              e.stopPropagation();
              onTitleClick();
            }}
            title={slot.title ? "Edit title" : "Add title"}
          >
            {isRecording
              ? "Recording..."
              : slot.title || (
                  <span className="opacity-0 group-hover:opacity-60">
                    {slot.audioData ? "Add title..." : "Record"}
                  </span>
                )}
          </span>
        </div>
      </Button>
    </div>
  );
}
