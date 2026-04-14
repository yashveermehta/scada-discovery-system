/**
 * API Client - Handles all API calls
 */

const API_BASE = 'http://127.0.0.1:5000/api';

const API = {
    /**
     * Get API information
     */
    async getInfo() {
        const response = await fetch(`${API_BASE}/info`);
        return await response.json();
    },

    /**
     * Get configuration
     */
    async getConfig() {
        const response = await fetch(`${API_BASE}/config`);
        return await response.json();
    },

    /**
     * Get current topology
     */
    async getTopology() {
        const response = await fetch(`${API_BASE}/topology`);
        return await response.json();
    },

    /**
     * Start topology discovery
     */
    async startDiscovery(seedDevices = null) {
        const response = await fetch(`${API_BASE}/discover`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                seed_devices: seedDevices
            })
        });
        return await response.json();
    },

    /**
     * Load demo topology
     */
    async loadDemo() {
        const response = await fetch(`${API_BASE}/demo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return await response.json();
    },
    /**
     * Get discovery status
     */
    async getStatus() {
        const response = await fetch(`${API_BASE}/status`);
        return await response.json();
    },

    /**
     * Get device details
     */
    async getDevice(ip) {
        const response = await fetch(`${API_BASE}/device/${ip}`);
        return await response.json();
    },

    /**
     * Get statistics
     */
    async getStats() {
        const response = await fetch(`${API_BASE}/stats`);
        return await response.json();
    },

    /**
     * Export topology
     */
    async exportTopology(format = 'json') {
        const response = await fetch(`${API_BASE}/export/${format}`);
        return await response.json();
    }
};

// Expose for other scripts (e.g. topology.js)
window.API_BASE = API_BASE;
window.API = API;