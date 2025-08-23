# M3U Playlist Merger for Cloudflare Pages

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)

This project is a serverless function designed for Cloudflare Pages that dynamically fetches, merges, and standardizes M3U playlist files from multiple sources. It's built to be deployed as a single `_worker.js` file, offering a powerful way to manage IPTV playlists with advanced features like channel deduplication, category standardization, and robust channel number assignment.

## ✨ Features

*   **Playlist Merging**: Aggregates multiple M3U playlists into a single, unified list.
*   **Deduplication**: Intelligently removes duplicate channels based on their stream URL or TVG ID to ensure a clean playlist.
*   **Chinese Channel Filtering**: Provides a dedicated endpoint to generate a playlist containing only Chinese-language channels.
*   **Category Standardization**: Normalizes channel groups into a consistent set of categories (e.g., 'News', 'Sports', 'Movies').
*   **Robust Channel Numbering**: Assigns a unique and persistent channel number (`tvg-chno`) to every entry, starting from 101. It respects existing valid numbers and intelligently fills in missing ones.
*   **On-the-Fly Processing**: All operations are performed in real-time when you request the playlist.
*   **Caching**: Utilizes Cloudflare's cache to deliver playlists quickly and reduce fetches to the source URLs.
*   **Debugging Mode**: A built-in debug view to inspect the merging and channel assignment process.
*   **Serverless**: Runs entirely on the Cloudflare network with no servers to manage.

## 🚀 Usage

Once deployed to your Cloudflare Pages project, you can access the following endpoints:

*   `/hello`
    *   A simple health check endpoint to confirm the worker is running. Returns an "ok" response.
*   `/merged.m3u`
    *   Provides the main playlist with all channels from the configured sources, after merging, deduplication, and standardization.
*   `/chinese.m3u`
    *   Delivers a filtered playlist containing only channels identified as Chinese.
*   `/merged.m3u?debug=1`
    *   Accesses the debug mode for the merged playlist. This returns a text file with detailed statistics and a full channel directory, showing how each channel was processed and what number it was assigned.

## 🛠️ How It Works

The `_worker.js` script intercepts requests to specific paths on your Cloudflare Pages site.

1.  **Fetch**: When a request for a playlist is made, the worker fetches the content from the M3U sources defined in the `SOURCES` array.
2.  **Parse**: Each M3U file is parsed line-by-line to extract channel information, including its name, stream URL, TVG ID, group title, and channel number.
3.  **Categorize & Filter**: Channels are identified as Chinese if they contain Chinese characters in their name or come from a designated primary Chinese source. For other channels, a `standardizeCategory` function is used to map various group titles to a clean, standard set.
4.  **Deduplicate**: The script removes duplicate channels by tracking stream URLs and TVG IDs.
5.  **Assign Channel Numbers**: A two-pass system ensures every channel gets a valid number. It first catalogs all existing valid channel numbers and then assigns new, sequential numbers (starting from 101) to any channel that lacks one.
6.  **Serialize**: The final, clean list of channels is serialized back into a standard M3U text format.
7.  **Cache & Deliver**: The generated playlist is cached on Cloudflare's edge network for faster subsequent requests and then delivered to the user.

## 部署 (Deployment)

This project is designed to be deployed as a single script using the "advanced" routing mode on Cloudflare Pages.

1.  **Fork this Repository**: Start by forking this repository to your own GitHub account.
2.  **Create a Cloudflare Pages Project**:
    *   Log in to your Cloudflare dashboard.
    *   Go to **Workers & Pages** and select the **Pages** tab.
    *   Click **Create a project** and connect it to your forked GitHub repository.
3.  **Configure the Build**:
    *   You can skip the build settings as there's no traditional build step.
4.  **Deploy**:
    *   Deploy the project.
5.  **Enable Advanced Mode**:
    *   After the initial deployment, go to your project's **Settings** > **Functions**.
    *   Under **Functions compatibility flags**, ensure you have `nodejs_compat` enabled if you plan to extend functionality with Node.js APIs.
    *   The worker will be active and listening for requests to the defined paths.

## 🔧 Customization

You can easily customize the script by editing the `_worker.js` file:

*   **Add More Sources**: To include more M3U playlists, simply add their URLs to the `SOURCES` array.

    ```javascript
    const SOURCES = [
      'https://aktv.space/live.m3u',
      'https://iptv-org.github.io/iptv/index.m3u',
      // Add your new source URL here
    ];
    ```

*   **Change Chinese Source**: Modify the `PRIMARY_CHINESE_SOURCE` variable if you have a different primary source for Chinese channels.

    ```javascript
    const PRIMARY_CHINESE_SOURCE = 'https://your-primary-source.com/live.m3u';
    ```

*   **Adjust Categories**: You can expand the `categoryMap` in the `standardizeCategory` function to handle more group titles.

    ```javascript
    const categoryMap = {
      'news': 'News', 'sport': 'Sports', 'movie': 'Movies',
      // Add new mappings here
    };
    ```

---
