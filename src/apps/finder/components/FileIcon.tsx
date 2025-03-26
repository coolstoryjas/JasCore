import { useSound, Sounds } from "@/hooks/useSound";

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  icon?: string;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  isSelected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  size?: "small" | "large";
  className?: string;
}

export function FileIcon({
  name,
  isDirectory,
  icon,
  onDoubleClick,
  isSelected,
  onClick,
  size = "small",
  className,
}: FileIconProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const getIconPath = () => {
    if (icon) return icon;
    if (isDirectory) return "/icons/directory.png";
    if (name.endsWith(".txt") || name.endsWith(".md"))
      return "/icons/file-text.png";
    return "/icons/file.png";
  };

  const sizeClasses = {
    small: {
      container: "w-[80px]",
      icon: "w-12 h-12",
      image: "w-[32px] h-[32px]",
      text: "text-[10px] max-w-[90px]",
    },
    large: {
      container: "w-24",
      icon: "w-16 h-16",
      image: "w-12 h-12",
      text: "text-[12px] max-w-[96px]",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={`flex flex-col items-center justify-start cursor-pointer gap-1 ${sizes.container} ${className}`}
      onDoubleClick={onDoubleClick}
      onClick={(e) => {
        playClick();
        onClick?.(e);
      }}
    >
      <div
        className={`flex items-center justify-center ${sizes.icon} ${
          isSelected ? "brightness-65 contrast-100" : ""
        }`}
      >
        <img
          src={getIconPath()}
          alt={isDirectory ? "Directory" : "File"}
          className={`object-contain ${sizes.image}`}
          style={{ imageRendering: "pixelated" }}
        />
      </div>
      <span
        className={`text-center px-1 font-geneva-12 break-words truncate ${
          sizes.text
        } ${isSelected ? "bg-black text-white" : "bg-white text-black"}`}
      >
        {name}
      </span>
    </div>
  );
}
