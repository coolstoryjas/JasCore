import { useState, useEffect, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { Input } from "@/components/ui/input";
import { InternetExplorerMenuBar } from "./InternetExplorerMenuBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Favorite,
  loadFavorites,
  saveFavorites,
  loadLastUrl,
  saveLastUrl,
  DEFAULT_URL,
  DEFAULT_YEAR,
  HistoryEntry,
  loadHistory,
  addToHistory,
  APP_STORAGE_KEYS,
  loadWaybackYear,
  saveWaybackYear,
} from "@/utils/storage";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";

interface NavigationState {
  url: string;
  year: string;
  currentUrl: string | null;
}

export function InternetExplorerAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
}: AppProps) {
  const initialUrl = loadLastUrl();
  const initialYear = loadWaybackYear();

  const [navigation, setNavigation] = useState<NavigationState>({
    url: initialUrl,
    year: initialYear,
    currentUrl: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isTitleDialogOpen, setIsTitleDialogOpen] = useState(false);
  const [newFavoriteTitle, setNewFavoriteTitle] = useState("");
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isNavigatingHistory, setIsNavigatingHistory] = useState(false);
  const [isClearFavoritesDialogOpen, setClearFavoritesDialogOpen] =
    useState(false);
  const [isClearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [hasMoreToScroll, setHasMoreToScroll] = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);

  // Add a ref to track navigation in progress
  const navigationInProgressRef = useRef(false);

  const years = Array.from(
    { length: new Date().getFullYear() - 1996 },
    (_, i) => (1996 + i).toString()
  );

  // Effect to load initial state and start initial navigation
  useEffect(() => {
    const initializeState = async () => {
      setFavorites(loadFavorites());
      const loadedHistory = loadHistory();
      setHistory(loadedHistory);
      if (loadedHistory.length > 0) {
        setHistoryIndex(0);
      }

      // Start initial navigation with the loaded URL and year
      const initialUrl = loadLastUrl();
      const initialYear = loadWaybackYear();

      // Keep loading state true during initial navigation
      setIsLoading(true);
      navigationInProgressRef.current = true;

      // First set the navigation state without triggering navigation
      setNavigation({
        url: initialUrl,
        year: initialYear,
        currentUrl: null,
      });

      // Then explicitly trigger navigation after state is set
      if (initialYear !== "current") {
        const waybackUrl = await getWaybackUrl(initialUrl, initialYear);
        if (waybackUrl) {
          setNavigation((prev) => ({
            ...prev,
            currentUrl: waybackUrl,
          }));
        }
      } else {
        // For current year, just use the URL directly
        setNavigation((prev) => ({
          ...prev,
          currentUrl: initialUrl.startsWith("http")
            ? initialUrl
            : `https://${initialUrl}`,
        }));
      }

      // Don't set isLoading to false here - let the iframe load handler handle it
    };

    initializeState();
  }, []); // Only run on mount

  // Effect to persist navigation state - but don't trigger navigation
  useEffect(() => {
    if (navigation.url && navigation.year) {
      saveLastUrl(navigation.url);
      saveWaybackYear(navigation.year);
    }
  }, [navigation.url, navigation.year]);

  useEffect(() => {
    const checkScroll = () => {
      const container = favoritesContainerRef.current;
      if (container) {
        const hasMore =
          container.scrollWidth > container.clientWidth &&
          container.scrollLeft < container.scrollWidth - container.clientWidth;
        setHasMoreToScroll(hasMore);
      }
    };

    const container = favoritesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      // Also check on resize
      window.addEventListener("resize", checkScroll);
      // Initial check
      checkScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      }
    };
  }, [favorites]); // Re-run when favorites change

  const getWaybackUrl = async (targetUrl: string, year: string) => {
    if (year === "current") return targetUrl;

    // Get current date for month and day
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    // Directly construct the wayback URL without checking availability
    const formattedUrl = targetUrl.startsWith("http")
      ? targetUrl
      : `https://${targetUrl}`;

    return `https://web.archive.org/web/${year}${month}${day}/${formattedUrl}`;
  };

  // Update iframe load handler
  const handleIframeLoad = () => {
    setIsLoading(false);
    navigationInProgressRef.current = false;
  };

  const handleNavigate = async (
    targetUrl: string = navigation.url,
    addToHistoryStack = true,
    year: string = navigation.year
  ) => {
    setIsLoading(true);
    navigationInProgressRef.current = true;
    setError(null);

    // Add a timeout to clear loading state after 10 seconds
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
      navigationInProgressRef.current = false;
    }, 10000);

    let newUrl = targetUrl.startsWith("http")
      ? targetUrl
      : `https://${targetUrl}`;

    // Store original URL info before potentially converting to wayback URL
    const originalUrlInfo = new URL(newUrl);
    const originalHostname = originalUrlInfo.hostname;
    const originalFavicon = `https://www.google.com/s2/favicons?domain=${originalHostname}&sz=32`;

    try {
      if (year !== "current") {
        const waybackUrl = await getWaybackUrl(newUrl, year);
        if (!waybackUrl) {
          clearTimeout(loadingTimeout);
          setIsLoading(false);
          navigationInProgressRef.current = false;
          return;
        }
        newUrl = waybackUrl;
      }

      // Update navigation state atomically
      setNavigation((prev) => ({
        url: targetUrl,
        year: year,
        currentUrl:
          newUrl === prev.currentUrl
            ? `${newUrl}${newUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`
            : newUrl,
      }));

      if (addToHistoryStack && !isNavigatingHistory) {
        const newEntry = {
          url: targetUrl,
          title: originalHostname,
          favicon: originalFavicon,
          timestamp: Date.now(),
          year: year !== "current" ? year : undefined,
        };

        setHistory((prev) => [newEntry, ...prev]);
        setHistoryIndex(0);
        addToHistory(newEntry);
      }
    } catch (error) {
      clearTimeout(loadingTimeout);
      setError(`Failed to navigate: ${error}`);
      setIsLoading(false);
      navigationInProgressRef.current = false;
    }
  };

  const handleNavigateWithHistory = async (
    targetUrl: string,
    year?: string
  ) => {
    setIsNavigatingHistory(false);
    handleNavigate(targetUrl, true, year || navigation.year);
  };

  const handleGoBack = () => {
    if (historyIndex < history.length - 1) {
      setIsNavigatingHistory(true);
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, false, entry.year || "current");
      setIsNavigatingHistory(false);
    }
  };

  const handleGoForward = () => {
    if (historyIndex > 0) {
      setIsNavigatingHistory(true);
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, false, entry.year || "current");
      setIsNavigatingHistory(false);
    }
  };

  const handleAddFavorite = () => {
    setNewFavoriteTitle(
      new URL(navigation.currentUrl || navigation.url).hostname
    );
    setIsTitleDialogOpen(true);
  };

  const handleTitleSubmit = () => {
    if (!newFavoriteTitle) return;
    const newFavorites = [
      ...favorites,
      {
        title: newFavoriteTitle,
        url: navigation.url,
        favicon: `https://www.google.com/s2/favicons?domain=${
          new URL(navigation.currentUrl || navigation.url).hostname
        }&sz=32`,
        year: navigation.year !== "current" ? navigation.year : undefined,
      },
    ];
    setFavorites(newFavorites);
    saveFavorites(newFavorites);
    setIsTitleDialogOpen(false);
  };

  const handleClearFavorites = () => {
    setClearFavoritesDialogOpen(true);
  };

  const confirmClearFavorites = () => {
    setFavorites([]);
    saveFavorites([]);
    setClearFavoritesDialogOpen(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    navigationInProgressRef.current = false;
    setError(
      `Cannot access ${
        navigation.currentUrl || navigation.url
      }. The website might be blocking access or requires authentication.`
    );
  };

  const handleRefresh = () => {
    handleNavigate();
  };

  const handleStop = () => {
    setIsLoading(false);
    navigationInProgressRef.current = false;
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
  };

  const handleGoToUrl = () => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  };

  const handleHome = () => {
    handleNavigate(DEFAULT_URL, true, DEFAULT_YEAR);
  };

  const handleClearHistory = () => {
    setClearHistoryDialogOpen(true);
  };

  const confirmClearHistory = () => {
    setHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem(APP_STORAGE_KEYS["internet-explorer"].HISTORY);
    setClearHistoryDialogOpen(false);
  };

  if (!isWindowOpen) return null;

  return (
    <>
      <InternetExplorerMenuBar
        isWindowOpen={isWindowOpen}
        isForeground={isForeground}
        onRefresh={handleRefresh}
        onStop={handleStop}
        onFocusUrlInput={handleGoToUrl}
        onHome={handleHome}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        isLoading={isLoading}
        favorites={favorites}
        history={history}
        onAddFavorite={handleAddFavorite}
        onClearFavorites={handleClearFavorites}
        onNavigateToFavorite={(url, year) =>
          handleNavigateWithHistory(url, year)
        }
        onNavigateToHistory={handleNavigateWithHistory}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        canGoBack={historyIndex < history.length - 1}
        canGoForward={historyIndex > 0}
        onClearHistory={handleClearHistory}
        onClose={onClose}
      />
      <WindowFrame
        title="Internet Explorer"
        onClose={onClose}
        isForeground={isForeground}
        appId="internet-explorer"
      >
        <div className="flex flex-col h-full w-full">
          <div className="flex flex-col gap-1 p-1 bg-gray-100 border-b border-black">
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoBack}
                  disabled={historyIndex >= history.length - 1}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGoForward}
                  disabled={historyIndex <= 0}
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <Input
                ref={urlInputRef}
                value={navigation.url}
                onChange={(e) =>
                  setNavigation((prev) => ({ ...prev, url: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleNavigate();
                  }
                }}
                className="flex-1"
                placeholder="Enter URL"
              />
              <div className="flex items-center gap-2">
                <Select
                  value={navigation.year}
                  onValueChange={(year) =>
                    handleNavigate(navigation.url, true, year)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Now</SelectItem>
                    {years.reverse().map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="relative">
              <div
                ref={favoritesContainerRef}
                className="overflow-x-auto scrollbar-none relative"
              >
                <div className="flex items-center min-w-full ">
                  {favorites.map((favorite, index) => (
                    <Button
                      key={index}
                      variant="ghost"
                      size="sm"
                      className="whitespace-nowrap hover:bg-gray-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                      onClick={() =>
                        handleNavigateWithHistory(favorite.url, favorite.year)
                      }
                    >
                      <img
                        src={favorite.favicon || "/icons/ie-site.png"}
                        alt="Site"
                        className="w-4 h-4 mr-1"
                        onError={(e) => {
                          e.currentTarget.src = "/icons/ie-site.png";
                        }}
                      />
                      <span className="truncate">{favorite.title}</span>
                    </Button>
                  ))}
                </div>
              </div>
              {favorites.length > 0 && hasMoreToScroll && (
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none" />
              )}
            </div>
          </div>
          <div className="flex-1 relative">
            {isLoading && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 overflow-hidden z-50">
                <div className="h-full bg-blue-500 animate-progress-indeterminate" />
              </div>
            )}
            {error ? (
              <div className="p-4 text-red-500">{error}</div>
            ) : (
              <iframe
                ref={iframeRef}
                src={navigation.currentUrl || ""}
                className="w-full h-full"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            )}
          </div>
        </div>
        <InputDialog
          isOpen={isTitleDialogOpen}
          onOpenChange={setIsTitleDialogOpen}
          onSubmit={handleTitleSubmit}
          title="Add Favorite"
          description="Enter a title for this favorite"
          value={newFavoriteTitle}
          onChange={setNewFavoriteTitle}
        />
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Internet Explorer"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearFavoritesDialogOpen}
          onOpenChange={setClearFavoritesDialogOpen}
          onConfirm={confirmClearFavorites}
          title="Clear Favorites"
          description="Are you sure you want to clear all favorites?"
        />
        <ConfirmDialog
          isOpen={isClearHistoryDialogOpen}
          onOpenChange={setClearHistoryDialogOpen}
          onConfirm={confirmClearHistory}
          title="Clear History"
          description="Are you sure you want to clear all history?"
        />
      </WindowFrame>
    </>
  );
}
