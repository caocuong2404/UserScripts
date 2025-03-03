// ==UserScript==
// @name         Douyin Video Metadata Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Download videos and metadata from Douyin user profiles
// @author       CaoCuong2404
// @match        https://www.douyin.com/user/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douyin.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        API_BASE_URL: "https://www.douyin.com/aweme/v1/web/aweme/post/",
        USER_AGENT: 
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.0.0",
        RETRY_DELAY_MS: 2000,
        MAX_RETRIES: 5,
        REQUEST_DELAY_MS: 1000,
    };

    function addUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '80px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.backgroundColor = 'white';
        container.style.border = '1px solid #ccc';
        container.style.borderRadius = '5px';
        container.style.padding = '10px';
        container.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
        container.style.width = '250px';

        const title = document.createElement('h3');
        title.textContent = 'Douyin Downloader';
        title.style.margin = '0 0 10px 0';
        title.style.padding = '0 0 5px 0';
        title.style.borderBottom = '1px solid #eee';
        container.appendChild(title);

        // Add download options
        const optionsDiv = document.createElement('div');
        optionsDiv.style.margin = '10px 0';
        
        // JSON Metadata option
        const jsonOption = document.createElement('div');
        const jsonCheckbox = document.createElement('input');
        jsonCheckbox.type = 'checkbox';
        jsonCheckbox.id = 'download-json';
        jsonCheckbox.checked = true;
        const jsonLabel = document.createElement('label');
        jsonLabel.htmlFor = 'download-json';
        jsonLabel.textContent = 'Download JSON metadata';
        jsonLabel.style.marginLeft = '5px';
        jsonOption.appendChild(jsonCheckbox);
        jsonOption.appendChild(jsonLabel);
        
        // Text Links option
        const txtOption = document.createElement('div');
        const txtCheckbox = document.createElement('input');
        txtCheckbox.type = 'checkbox';
        txtCheckbox.id = 'download-txt';
        txtCheckbox.checked = true;
        const txtLabel = document.createElement('label');
        txtLabel.htmlFor = 'download-txt';
        txtLabel.textContent = 'Download video links (TXT)';
        txtLabel.style.marginLeft = '5px';
        txtOption.appendChild(txtCheckbox);
        txtOption.appendChild(txtLabel);
        
        optionsDiv.appendChild(jsonOption);
        optionsDiv.appendChild(txtOption);
        container.appendChild(optionsDiv);

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download All Videos';
        downloadBtn.style.width = '100%';
        downloadBtn.style.padding = '8px';
        downloadBtn.style.backgroundColor = '#ff0050';
        downloadBtn.style.color = 'white';
        downloadBtn.style.border = 'none';
        downloadBtn.style.borderRadius = '4px';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.style.marginBottom = '10px';
        container.appendChild(downloadBtn);

        const statusElement = document.createElement('div');
        statusElement.id = 'downloader-status';
        statusElement.style.fontSize = '14px';
        statusElement.style.marginTop = '10px';
        container.appendChild(statusElement);

        document.body.appendChild(container);

        downloadBtn.addEventListener('click', async () => {
            const downloadJson = document.getElementById('download-json').checked;
            const downloadTxt = document.getElementById('download-txt').checked;
            
            if (!downloadJson && !downloadTxt) {
                statusElement.textContent = 'Please select at least one download option';
                return;
            }
            
            const downloader = new DouyinDownloader(statusElement);
            downloader.downloadOptions = { downloadJson, downloadTxt };
            await downloader.downloadAllVideos();
        });
    }

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
                cookie_enabled: "true",
                screen_width: "1920",
                screen_height: "1080",
                browser_language: "en-US",
                browser_platform: "Win32",
                browser_name: "Chrome",
                browser_version: "118.0.0.0",
                browser_online: "true",
                tzName: "America/Los_Angeles",
                cursor: maxCursor,
                web_id: "7242155500523021835",
            };

            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });

            const response = await fetch(url.toString(), {
                headers: {
                    "User-Agent": CONFIG.USER_AGENT,
                },
                method: "GET",
            });

            if (!response.ok) {
                throw new Error(`API response error: ${response.status}`);
            }

            return await response.json();
        }
    }

    class VideoDataProcessor {
        static extractVideoMetadata(video) {
            if (!video) return null;

            // Extract required metadata fields
            const id = video.aweme_id || '';
            const desc = video.desc || '';
            const title = desc;  // Using description as title
                        
            // Format creation time as ISO date string
            const createTime = video.create_time ? 
                new Date(video.create_time * 1000).toISOString() : '';
            
            // Extract video URL
            let videoUrl = '';
            if (video.video && video.video.play_addr && 
                video.video.play_addr.url_list && 
                video.video.play_addr.url_list.length > 0) {
                videoUrl = video.video.play_addr.url_list[0];
                
                // Convert HTTP to HTTPS if needed
                if (videoUrl.startsWith('http:')) {
                    videoUrl = videoUrl.replace('http:', 'https:');
                }
            }
            
            // Extract audio URL
            let audioUrl = '';
            if (video.music && video.music.play_url && 
                video.music.play_url.url_list && 
                video.music.play_url.url_list.length > 0) {
                audioUrl = video.music.play_url.url_list[0];
            }
            
            // Extract cover image URL
            let coverUrl = '';
            if (video.video && video.video.cover && 
                video.video.cover.url_list && 
                video.video.cover.url_list.length > 0) {
                coverUrl = video.video.cover.url_list[0];
            }
            
            // Extract dynamic cover URL (animated)
            let dynamicCoverUrl = '';
            if (video.video && video.video.dynamic_cover && 
                video.video.dynamic_cover.url_list && 
                video.video.dynamic_cover.url_list.length > 0) {
                dynamicCoverUrl = video.video.dynamic_cover.url_list[0];
            }
            
            return {
                id,
                desc,
                title,
                createTime,
                videoUrl,
                audioUrl,
                coverUrl,
                dynamicCoverUrl
            };
        }

        static processVideoData(data) {
            // Check if we have valid data with the aweme_list property
            if (!data || !data.aweme_list || !Array.isArray(data.aweme_list)) {
                console.warn("Invalid video data format", data);
                return [];
            }
            
            // Process each video to extract metadata
            return data.aweme_list
                .map(video => this.extractVideoMetadata(video))
                .filter(video => video && video.videoUrl); // Filter out videos without URLs
        }
    }

    class FileHandler {
        static saveVideoUrls(videoData, options = { downloadJson: true, downloadTxt: true }) {
            if (!videoData || videoData.length === 0) {
                console.warn("No video data to save");
                return { savedCount: 0 };
            }
            
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-');
            let savedCount = 0;
            
            // Save complete JSON data if option is enabled
            if (options.downloadJson) {
                const jsonContent = JSON.stringify(videoData, null, 2);
                const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
                const jsonUrl = URL.createObjectURL(jsonBlob);
                
                const jsonLink = document.createElement('a');
                jsonLink.href = jsonUrl;
                jsonLink.download = `douyin-video-data-${timestamp}.json`;
                jsonLink.style.display = 'none';
                document.body.appendChild(jsonLink);
                jsonLink.click();
                document.body.removeChild(jsonLink);
                
                console.log(`Saved ${videoData.length} videos with metadata to JSON file`);
            }
            
            // Save plain URLs list if option is enabled
            if (options.downloadTxt) {
                // Create a list of video URLs
                const urlList = videoData.map(video => video.videoUrl).join('\n');
                const txtBlob = new Blob([urlList], { type: 'text/plain' });
                const txtUrl = URL.createObjectURL(txtBlob);
                
                const txtLink = document.createElement('a');
                txtLink.href = txtUrl;
                txtLink.download = `douyin-video-links-${timestamp}.txt`;
                txtLink.style.display = 'none';
                document.body.appendChild(txtLink);
                txtLink.click();
                document.body.removeChild(txtLink);
                
                console.log(`Saved ${videoData.length} video URLs to text file`);
            }
            
            savedCount = videoData.length;
            return { savedCount };
        }
    }

    class DouyinDownloader {
        constructor(statusElement) {
            this.statusElement = statusElement;
            this.downloadOptions = { downloadJson: true, downloadTxt: true };
        }

        validateEnvironment() {
            // Check if we're on a Douyin user profile page
            const url = window.location.href;
            return url.includes('douyin.com/user/');
        }

        extractSecUserId() {
            const url = window.location.href;
            const match = url.match(/user\/([^?/]+)/);
            return match ? match[1] : null;
        }
        
        updateStatus(message) {
            if (this.statusElement) {
                this.statusElement.textContent = message;
            }
            console.log(message);
        }

        async downloadAllVideos() {
            try {
                if (!this.validateEnvironment()) {
                    this.updateStatus('This script only works on Douyin user profile pages');
                    return;
                }

                const secUserId = this.extractSecUserId();
                if (!secUserId) {
                    this.updateStatus('Could not find user ID in URL');
                    return;
                }

                this.updateStatus('Starting download process...');
                const client = new DouyinApiClient(secUserId);
                
                let hasMore = true;
                let maxCursor = 0;
                let allVideos = [];
                
                while (hasMore) {
                    this.updateStatus(`Fetching videos, cursor: ${maxCursor}...`);
                    
                    const data = await retryWithDelay(async () => {
                        return await client.fetchVideos(maxCursor);
                    });
                    
                    const videos = VideoDataProcessor.processVideoData(data);
                    allVideos = allVideos.concat(videos);
                    
                    this.updateStatus(`Found ${videos.length} videos (total: ${allVideos.length})`);
                    
                    // Check if there are more videos to fetch
                    hasMore = data.has_more === 1;
                    maxCursor = data.max_cursor;
                    
                    // Add a delay to avoid rate limiting
                    await sleep(CONFIG.REQUEST_DELAY_MS);
                }
                
                if (allVideos.length === 0) {
                    this.updateStatus('No videos found for this user');
                    return;
                }
                
                this.updateStatus(`Processing ${allVideos.length} videos...`);
                const result = FileHandler.saveVideoUrls(allVideos, this.downloadOptions);
                
                this.updateStatus(`Download complete! Saved ${result.savedCount} videos`);
            } catch (error) {
                console.error('Download failed:', error);
                this.updateStatus(`Error: ${error.message}`);
            }
        }
    }

    async function run() {
        // Wait for the page to load fully
        setTimeout(() => {
            addUI();
            console.log('Douyin Video Downloader initialized');
        }, 2000);
    }

    // Initialize the script
    run();
})();
