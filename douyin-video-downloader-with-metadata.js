// ==UserScript==
// @name         Douyin Video Downloader with Metadata
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extract video links and metadata from Douyin user profiles
// @author       You
// @match        https://www.douyin.com/user/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douyin.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // Add UI elements
  function addUI() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.bottom = "20px";
    container.style.right = "20px";
    container.style.zIndex = "9999";
    container.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    container.style.padding = "15px";
    container.style.borderRadius = "5px";
    container.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
    container.style.color = "white";
    container.style.fontFamily = "Arial, sans-serif";
    container.style.fontSize = "14px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";

    const title = document.createElement("div");
    title.textContent = "Douyin Downloader";
    title.style.fontWeight = "bold";
    title.style.fontSize = "16px";
    container.appendChild(title);

    const downloadButton = document.createElement("button");
    downloadButton.textContent = "Download All Videos with Metadata";
    downloadButton.style.padding = "8px 12px";
    downloadButton.style.backgroundColor = "#FE2C55"; // Douyin red color
    downloadButton.style.color = "white";
    downloadButton.style.border = "none";
    downloadButton.style.borderRadius = "4px";
    downloadButton.style.cursor = "pointer";
    downloadButton.style.fontWeight = "bold";
    downloadButton.onclick = () => {
      downloadButton.disabled = true;
      downloadButton.textContent = "Downloading...";
      statusText.textContent = "Starting download...";
      run()
        .then(() => {
          downloadButton.disabled = false;
          downloadButton.textContent = "Download All Videos with Metadata";
        })
        .catch((error) => {
          statusText.textContent = `Error: ${error.message}`;
          downloadButton.disabled = false;
          downloadButton.textContent = "Try Again";
        });
    };
    container.appendChild(downloadButton);

    const statusText = document.createElement("div");
    statusText.textContent = "Ready";
    statusText.style.fontSize = "12px";
    statusText.style.color = "#ccc";
    container.appendChild(statusText);

    document.body.appendChild(container);

    return { statusText };
  }

  // Configuration
  const CONFIG = {
    API_BASE_URL: "https://www.douyin.com/aweme/v1/web/aweme/post/",
    DEFAULT_HEADERS: {
      accept: "application/json, text/plain, */*",
      "accept-language": "vi",
      "sec-ch-ua": '"Not?A_Brand";v="8", "Chromium";v="118", "Microsoft Edge";v="118"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.0.0",
    },
    RETRY_DELAY_MS: 2000,
    MAX_RETRIES: 5,
    REQUEST_DELAY_MS: 1000,
  };

  // Utility functions
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const retryWithDelay = async (fn, retries = CONFIG.MAX_RETRIES) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${i + 1} failed:`, error);
        await sleep(CONFIG.RETRY_DELAY_MS);
      }
    }
    throw lastError;
  };

  // API Client
  class DouyinApiClient {
    constructor(secUserId) {
      this.secUserId = secUserId;
    }

    async fetchVideos(maxCursor) {
      const url = new URL(CONFIG.API_BASE_URL);
      const params = {
        device_platform: "webapp",
        aid: "6383",
        channel: "channel_pc_web",
        sec_user_id: this.secUserId,
        max_cursor: maxCursor,
        count: "20",
        version_code: "170400",
        version_name: "17.4.0",
      };

      Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

      const response = await fetch(url, {
        headers: {
          ...CONFIG.DEFAULT_HEADERS,
          referrer: `https://www.douyin.com/user/${this.secUserId}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return response.json();
    }
  }

  // Data Processing
  class VideoDataProcessor {
    static extractVideoMetadata(video) {
      if (!video) return null;

      // Initialize the metadata object
      const metadata = {
        id: video.aweme_id || "",
        desc: video.desc || "",
        title: video.desc || "", // Using desc as the title since title field isn't directly available
        createTime: video.create_time ? new Date(video.create_time * 1000).toISOString() : "",
        videoUrl: "",
        audioUrl: "",
        coverUrl: "",
        dynamicCoverUrl: "",
      };

      // Extract video URL
      if (video.video?.play_addr) {
        metadata.videoUrl = video.video.play_addr.url_list[0];
        if (metadata.videoUrl && !metadata.videoUrl.startsWith("https")) {
          metadata.videoUrl = metadata.videoUrl.replace("http", "https");
        }
      } else if (video.video?.download_addr) {
        metadata.videoUrl = video.video.download_addr.url_list[0];
        if (metadata.videoUrl && !metadata.videoUrl.startsWith("https")) {
          metadata.videoUrl = metadata.videoUrl.replace("http", "https");
        }
      }

      // Extract audio URL
      if (video.music?.play_url) {
        metadata.audioUrl = video.music.play_url.url_list[0];
      }

      // Extract cover URL (static thumbnail)
      if (video.video?.cover) {
        metadata.coverUrl = video.video.cover.url_list[0];
      } else if (video.cover) {
        metadata.coverUrl = video.cover.url_list[0];
      }

      // Extract dynamic cover URL (animated thumbnail)
      if (video.video?.dynamic_cover) {
        metadata.dynamicCoverUrl = video.video.dynamic_cover.url_list[0];
      } else if (video.dynamic_cover) {
        metadata.dynamicCoverUrl = video.dynamic_cover.url_list[0];
      }

      return metadata;
    }

    static processVideoData(data) {
      if (!data?.aweme_list) {
        return { videoData: [], hasMore: false, maxCursor: 0 };
      }

      const videoData = data.aweme_list.map((video) => this.extractVideoMetadata(video)).filter((item) => item && item.videoUrl);

      return {
        videoData,
        hasMore: data.has_more,
        maxCursor: data.max_cursor,
      };
    }
  }

  // File Handler
  class FileHandler {
    static saveVideoUrls(videoData) {
      if (!videoData.length) {
        throw new Error("No video data to save");
      }

      // Save full JSON data for comprehensive metadata
      const jsonBlob = new Blob([JSON.stringify(videoData, null, 2)], { type: "application/json" });
      const jsonLink = document.createElement("a");
      jsonLink.href = window.URL.createObjectURL(jsonBlob);
      jsonLink.download = "douyin-video-data.json";
      jsonLink.click();

      // Also save plain URLs for backward compatibility
      const urls = videoData.map((item) => item.videoUrl);
      const txtBlob = new Blob([urls.join("\n")], { type: "text/plain" });
      const txtLink = document.createElement("a");
      txtLink.href = window.URL.createObjectURL(txtBlob);
      txtLink.download = "douyin-video-links.txt";
      txtLink.click();

      return {
        jsonCount: videoData.length,
        urlCount: urls.length,
      };
    }
  }

  // Main Downloader
  class DouyinDownloader {
    constructor(statusElement) {
      this.validateEnvironment();
      const secUserId = this.extractSecUserId();
      this.apiClient = new DouyinApiClient(secUserId);
      this.statusElement = statusElement;
    }

    validateEnvironment() {
      if (typeof window === "undefined" || !window.location) {
        throw new Error("Script must be run in a browser environment");
      }
    }

    extractSecUserId() {
      const secUserId = location.pathname.replace("/user/", "");
      if (!secUserId || location.pathname.indexOf("/user/") === -1) {
        throw new Error("Please run this script on a DouYin user profile page!");
      }
      return secUserId;
    }

    updateStatus(message) {
      if (this.statusElement) {
        this.statusElement.textContent = message;
      }
      console.log(message);
    }

    async downloadAllVideos() {
      try {
        this.updateStatus("Starting video data collection...");
        const allVideoData = [];
        let hasMore = true;
        let maxCursor = 0;

        while (hasMore) {
          this.updateStatus(`Fetching videos with cursor: ${maxCursor}`);

          const data = await retryWithDelay(() => this.apiClient.fetchVideos(maxCursor));

          const { videoData, hasMore: more, maxCursor: newCursor } = VideoDataProcessor.processVideoData(data);

          allVideoData.push(...videoData);
          hasMore = more;
          maxCursor = newCursor;

          this.updateStatus(`Found: ${allVideoData.length} videos`);

          await sleep(CONFIG.REQUEST_DELAY_MS);
        }

        if (allVideoData.length > 0) {
          this.updateStatus(`Saving ${allVideoData.length} videos with metadata...`);
          const result = FileHandler.saveVideoUrls(allVideoData);
          this.updateStatus(
            `Download complete! Saved ${result.jsonCount} videos with metadata to JSON and ${result.urlCount} URLs to TXT.`,
          );
        } else {
          this.updateStatus("No videos found.");
        }
      } catch (error) {
        this.updateStatus(`Error downloading videos: ${error.message}`);
        throw error;
      }
    }
  }

  // Script initialization
  async function run() {
    try {
      const ui = window.douyinDownloaderUI || addUI();
      window.douyinDownloaderUI = ui;

      const downloader = new DouyinDownloader(ui.statusText);
      await downloader.downloadAllVideos();
    } catch (error) {
      console.error("Critical error:", error);
      alert(`An error occurred: ${error.message}`);
    }
  }

  // Add the UI to the page after it's loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addUI);
  } else {
    addUI();
  }
})();
