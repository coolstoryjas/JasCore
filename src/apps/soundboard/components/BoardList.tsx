import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Soundboard } from "@/types/types";

interface BoardListProps {
  boards: Soundboard[];
  activeBoardId: string;
  onBoardSelect: (id: string) => void;
  onNewBoard: () => void;
  selectedDeviceId: string;
  onDeviceSelect: (deviceId: string) => void;
  audioDevices: MediaDeviceInfo[];
  micPermissionGranted: boolean;
}

export function BoardList({
  boards,
  activeBoardId,
  onBoardSelect,
  onNewBoard,
  selectedDeviceId,
  onDeviceSelect,
  audioDevices,
  micPermissionGranted,
}: BoardListProps) {
  return (
    <div className="w-full md:w-56 bg-gray-100 md:border-r border-b md:border-b-0 flex flex-col md:h-full max-h-35 md:max-h-none">
      <div className="py-2 md:py-3 px-4 flex flex-col h-full">
        <div className="flex justify-between items-center md:mb-4">
          <h2 className="text-lg">Soundboards</h2>
          <Button variant="ghost" size="icon" onClick={onNewBoard}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto md:space-y-2">
          {boards.map((board) => (
            <Button
              key={board.id}
              variant={board.id === activeBoardId ? "default" : "ghost"}
              className="w-full justify-start text-lg"
              onClick={() => onBoardSelect(board.id)}
            >
              {board.name}
            </Button>
          ))}
        </div>

        {micPermissionGranted && (
          <div className="mt-auto py-4 pb-8">
            <Select value={selectedDeviceId} onValueChange={onDeviceSelect}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {audioDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label ||
                      `Microphone ${device.deviceId.slice(0, 4)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
