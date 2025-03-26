import { useWindowManager } from "@/hooks/useWindowManager";
import { ResizeType } from "@/types/types";
import { APP_STORAGE_KEYS } from "@/utils/storage";
import { useAppContext } from "@/contexts/AppContext";
import { useSound, Sounds } from "@/hooks/useSound";
import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getWindowConfig } from "@/config/appRegistry";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { AppId } from "@/config/appRegistry";
import { useIsMobile } from "@/hooks/useIsMobile";

interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  onClose?: () => void;
  isForeground?: boolean;
  appId: keyof typeof APP_STORAGE_KEYS;
  isShaking?: boolean;
  windowConstraints?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number | string;
    maxHeight?: number | string;
  };
}

export function WindowFrame({
  children,
  title,
  onClose,
  isForeground = true,
  isShaking = false,
  appId,
  windowConstraints = {},
}: WindowFrameProps) {
  const config = getWindowConfig(appId);
  const defaultConstraints = {
    minWidth: config.minSize?.width,
    minHeight: config.minSize?.height,
    maxWidth: config.maxSize?.width,
    maxHeight: config.maxSize?.height,
    defaultSize: config.defaultSize,
  };

  // Merge provided constraints with defaults from config
  const mergedConstraints = {
    ...defaultConstraints,
    ...windowConstraints,
  };

  const [isOpen, setIsOpen] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const { bringToForeground, navigateToNextApp, navigateToPreviousApp } =
    useAppContext();
  const { play: playWindowOpen } = useSound(Sounds.WINDOW_OPEN);
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);
  const [isFullHeight, setIsFullHeight] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isMobile = useIsMobile();
  const lastTapTimeRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingTapRef = useRef(false);
  const lastToggleTimeRef = useRef<number>(0);
  // Keep track of window size before maximizing to restore it later
  const previousSizeRef = useRef({ width: 0, height: 0 });

  // Setup swipe navigation for mobile
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isSwiping,
    swipeDirection,
  } = useSwipeNavigation({
    currentAppId: appId as AppId,
    isActive: isMobile && isForeground,
    onSwipeLeft: (currentAppId) => navigateToNextApp(currentAppId),
    onSwipeRight: (currentAppId) => navigateToPreviousApp(currentAppId),
    threshold: 100,
  });

  useEffect(() => {
    playWindowOpen();
    // Remove initial mount state after animation
    const timer = setTimeout(() => setIsInitialMount(false), 200);
    return () => clearTimeout(timer);
  }, []); // Play sound when component mounts

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (
        e.target === e.currentTarget &&
        !isOpen &&
        e.propertyName === "opacity"
      ) {
        setIsVisible(false);
        onClose?.();
      }
    },
    [isOpen, onClose]
  );

  const handleClose = () => {
    playWindowClose();
    setIsOpen(false);
  };

  const {
    windowPosition,
    windowSize,
    isDragging,
    resizeType,
    handleMouseDown: handleMouseDownBase,
    handleResizeStart,
    maximizeWindowHeight,
    setWindowSize,
    setWindowPosition,
  } = useWindowManager({ appId });

  // No longer track maximized state based on window dimensions
  useEffect(() => {
    const menuBarHeight = 30;
    const maxPossibleHeight = window.innerHeight - menuBarHeight;
    // Consider window at full height if it's within 5px of max height (to account for rounding)
    setIsFullHeight(Math.abs(windowSize.height - maxPossibleHeight) < 5);
  }, [windowSize.height]);

  const handleMouseDown = (
    e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>
  ) => {
    handleMouseDownBase(e);
    if (!isForeground) {
      bringToForeground(appId);
    }
  };

  const handleResizeStartWithForeground = (
    e: React.MouseEvent | React.TouchEvent,
    type: ResizeType
  ) => {
    handleResizeStart(e, type);
    if (!isForeground) {
      bringToForeground(appId);
    }
  };

  // This function only maximizes height (for bottom resize handle)
  const handleHeightOnlyMaximize = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();

    // If window is already fully maximized, do nothing - let handleFullMaximize handle the restoration
    if (isMaximized) return;

    if (isFullHeight) {
      // Restore to default height from app's configuration
      setIsFullHeight(false);
      setWindowSize((prev) => ({
        ...prev,
        height: mergedConstraints.defaultSize.height,
      }));
    } else {
      // Set to full height
      setIsFullHeight(true);
      maximizeWindowHeight(mergedConstraints.maxHeight);
    }
  };

  // This function maximizes both width and height (for titlebar)
  const handleFullMaximize = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();

    const now = Date.now();
    // Add cooldown to prevent rapid toggling (300ms)
    if (now - lastToggleTimeRef.current < 300) {
      return;
    }
    lastToggleTimeRef.current = now;

    // Toggle the maximized state directly
    const newMaximizedState = !isMaximized;
    setIsMaximized(newMaximizedState);

    if (!newMaximizedState) {
      // Restoring to default size
      const defaultSize = mergedConstraints.defaultSize;

      setWindowSize({
        width: defaultSize.width,
        height: defaultSize.height,
      });

      // Center the window if we're restoring from a maximized state
      if (window.innerWidth >= 768) {
        setWindowPosition({
          x: Math.max(0, (window.innerWidth - defaultSize.width) / 2),
          y: Math.max(30, (window.innerHeight - defaultSize.height) / 2),
        });
      }
    } else {
      // Maximizing the window
      // Save current size before maximizing
      previousSizeRef.current = {
        width: windowSize.width,
        height: windowSize.height,
      };

      // Set to full width and height
      const menuBarHeight = 30;
      const maxPossibleHeight = window.innerHeight - menuBarHeight;
      const maxHeight = mergedConstraints.maxHeight
        ? typeof mergedConstraints.maxHeight === "string"
          ? parseInt(mergedConstraints.maxHeight)
          : mergedConstraints.maxHeight
        : maxPossibleHeight;
      const newHeight = Math.min(maxPossibleHeight, maxHeight);

      // For width we use the full window width on mobile, otherwise respect constraints
      let newWidth = window.innerWidth;
      if (window.innerWidth >= 768) {
        const maxWidth = mergedConstraints.maxWidth
          ? typeof mergedConstraints.maxWidth === "string"
            ? parseInt(mergedConstraints.maxWidth)
            : mergedConstraints.maxWidth
          : window.innerWidth;
        newWidth = Math.min(window.innerWidth, maxWidth);
      }

      setWindowSize({
        width: newWidth,
        height: newHeight,
      });

      // Position at top of screen
      setWindowPosition({
        x: window.innerWidth >= 768 ? (window.innerWidth - newWidth) / 2 : 0,
        y: menuBarHeight,
      });
    }
  };

  // Handle double tap for titlebar
  const handleTitleBarTap = useCallback(
    (e: React.TouchEvent) => {
      // Don't stop propagation by default, only if we detect a double tap
      e.preventDefault();

      const now = Date.now();

      // If we're currently processing a tap or in cooldown, ignore this tap
      if (isProcessingTapRef.current || now - lastToggleTimeRef.current < 300) {
        return;
      }

      const timeSinceLastTap = now - lastTapTimeRef.current;

      // Clear any existing timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }

      // Check if this is a double tap (less than 300ms between taps)
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Only stop propagation if we detect a double tap
        e.stopPropagation();
        isProcessingTapRef.current = true;
        handleFullMaximize(e);
        // Reset the last tap time
        lastTapTimeRef.current = 0;

        // Reset processing flag after a delay that matches our cooldown
        setTimeout(() => {
          isProcessingTapRef.current = false;
        }, 300);
      } else {
        // Set timeout to reset last tap time if no second tap occurs
        doubleTapTimeoutRef.current = setTimeout(() => {
          lastTapTimeRef.current = 0;
        }, 300);

        // Update last tap time
        lastTapTimeRef.current = now;
      }
    },
    [handleFullMaximize]
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
    };
  }, []);

  if (!isVisible) return null;

  // Calculate dynamic style for swipe animation feedback
  const getSwipeStyle = () => {
    if (!isMobile || !isSwiping || !swipeDirection) {
      return {};
    }

    // Apply a slight translation effect during swipe
    const translateAmount = swipeDirection === "left" ? -10 : 10;
    return {
      transform: `translateX(${translateAmount}px)`,
      transition: "transform 0.1s ease",
    };
  };

  return (
    <div
      className={cn(
        "absolute p-2 md:p-0 w-full h-full md:mt-0 select-none",
        "transition-all duration-200 ease-in-out",
        isInitialMount && "animate-in fade-in-0 zoom-in-95 duration-200",
        isShaking && "animate-shake"
      )}
      onTransitionEnd={handleTransitionEnd}
      style={{
        left: windowPosition.x,
        top: Math.max(0, windowPosition.y),
        width: window.innerWidth >= 768 ? windowSize.width : "100%",
        height: Math.max(windowSize.height, mergedConstraints.minHeight || 0),
        minWidth:
          window.innerWidth >= 768 ? mergedConstraints.minWidth : "100%",
        minHeight: mergedConstraints.minHeight,
        maxWidth: mergedConstraints.maxWidth || undefined,
        maxHeight: mergedConstraints.maxHeight || undefined,
        transition: isDragging || resizeType ? "none" : undefined,
        transform: !isInitialMount && !isOpen ? "scale(0.95)" : undefined,
        opacity: !isInitialMount && !isOpen ? 0 : undefined,
        transformOrigin: "center",
      }}
    >
      <div className="relative w-full h-full">
        {/* Resize handles - positioned outside main content */}
        <div className="absolute -top-2 -left-2 -right-2 -bottom-2 pointer-events-none z-50">
          {/* Top resize handle */}
          <div
            className={cn(
              "absolute left-0 right-0 cursor-n-resize pointer-events-auto transition-[top,height]",
              resizeType?.includes("n")
                ? "top-[-100px] h-[200px]"
                : "-top-2 h-6" // reduced from h-10
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "n" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "n" as ResizeType)
            }
            onDoubleClick={handleHeightOnlyMaximize}
          />

          {/* Bottom resize handle */}
          <div
            className={cn(
              "absolute left-0 right-0 cursor-s-resize pointer-events-auto transition-[bottom,height]",
              resizeType?.includes("s")
                ? "bottom-[-100px] h-[200px]"
                : "-bottom-2 h-6" // reduced from h-10
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "s" as ResizeType)
            }
            onTouchStart={(e) =>
              handleResizeStartWithForeground(e, "s" as ResizeType)
            }
            onDoubleClick={handleHeightOnlyMaximize}
          />

          {/* Left resize handle */}
          <div
            className={cn(
              "absolute top-8 cursor-w-resize pointer-events-auto transition-[left,width]",
              resizeType?.includes("w")
                ? "left-[-100px] w-[200px]"
                : "-left-2 w-6" // reduced from w-10
            )}
            style={{ bottom: resizeType?.includes("s") ? "32px" : "32px" }}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "w" as ResizeType)
            }
          />

          {/* Right resize handle */}
          <div
            className={cn(
              "absolute top-8 cursor-e-resize pointer-events-auto transition-[right,width]",
              resizeType?.includes("e")
                ? "right-[-100px] w-[200px]"
                : "-right-2 w-6" // reduced from w-10
            )}
            style={{ bottom: resizeType?.includes("s") ? "32px" : "32px" }}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "e" as ResizeType)
            }
          />

          {/* Corner resize handles */}
          <div
            className={cn(
              "absolute cursor-ne-resize pointer-events-auto transition-all",
              resizeType === "ne"
                ? "top-[-100px] right-[-100px] w-[200px] h-[200px]"
                : "top-0 right-0 w-6 h-6" // reduced from w-8 h-8
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "ne" as ResizeType)
            }
          />

          <div
            className={cn(
              "absolute cursor-sw-resize pointer-events-auto transition-all",
              resizeType === "sw"
                ? "bottom-[-100px] left-[-100px] w-[200px] h-[200px]"
                : "bottom-0 left-0 w-6 h-6" // reduced from w-8 h-8
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "sw" as ResizeType)
            }
          />

          <div
            className={cn(
              "absolute cursor-se-resize pointer-events-auto transition-all",
              resizeType === "se"
                ? "bottom-[-100px] right-[-100px] w-[200px] h-[200px]"
                : "bottom-0 right-0 w-6 h-6" // reduced from w-8 h-8
            )}
            onMouseDown={(e) =>
              handleResizeStartWithForeground(e, "se" as ResizeType)
            }
          />
        </div>

        <div
          className={cn(
            "w-full h-full flex flex-col bg-system7-window-bg border-[2px] border-black rounded-lg overflow-hidden",
            isForeground ? "shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]" : ""
          )}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
          style={getSwipeStyle()}
        >
          {/* Title bar */}
          <div
            className={`flex items-center shrink-0 h-6 min-h-6 mx-0 my-[0.1rem] px-[0.1rem] py-[0.2rem] ${
              isForeground
                ? "bg-[linear-gradient(#000_50%,transparent_0)] bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-black"
                : "bg-white border-b-gray-400"
            } cursor-move border-b-[2px]`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
          >
            <button
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`ml-2 w-4 h-4 bg-white border-2 border-black hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center shadow-[0_0_0_1px_white] ${
                !isForeground && "invisible"
              }`}
            />
            <span
              className={`select-none mx-auto bg-white px-2 py-0 h-full flex items-center justify-center max-w-[80%] truncate ${
                !isForeground && "text-gray-500"
              }`}
              onDoubleClick={handleFullMaximize}
              onTouchStart={(e) => {
                handleTitleBarTap(e);
                // Allow the event to bubble up to the titlebar for drag handling
                handleMouseDown(e);
              }}
              onTouchMove={(e) => e.preventDefault()}
            >
              {title}
            </span>
            <div className="mr-2 w-4 h-4" />
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
