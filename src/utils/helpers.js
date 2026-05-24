// backend/src/utils/helpers.js

/**
 * Generate a random string
 */
const generateRandomString = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Generate a temporary password
 */
const generateTempPassword = () => {
    return generateRandomString(10) + 'Tmp@123';
};

/**
 * Format date to readable string
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
    if (format === 'DD/MM/YYYY') return `${day}/${month}/${year}`;
    if (format === 'full') return `${year}-${month}-${day} ${hours}:${minutes}`;
    return `${year}-${month}-${day}`;
};

/**
 * Check if value is empty
 */
const isEmpty = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
};

/**
 * Capitalize first letter of string
 */
const capitalize = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Truncate string to specified length
 */
const truncate = (str, length = 100, suffix = '...') => {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
};

/**
 * Remove special characters from string
 */
const sanitizeString = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[^\w\s]/gi, '');
};

/**
 * Convert string to slug
 */
const slugify = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

/**
 * Calculate percentage
 */
const calculatePercentage = (value, total) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
};

/**
 * Group array by key
 */
const groupBy = (array, key) => {
    return array.reduce((result, item) => {
        const groupKey = item[key];
        if (!result[groupKey]) {
            result[groupKey] = [];
        }
        result[groupKey].push(item);
        return result;
    }, {});
};

/**
 * Sleep/delay function
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
const retry = async (fn, retries = 3, delay = 1000) => {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        await sleep(delay);
        return retry(fn, retries - 1, delay * 2);
    }
};

module.exports = {
    generateRandomString,
    generateTempPassword,
    formatDate,
    isEmpty,
    capitalize,
    truncate,
    sanitizeString,
    slugify,
    calculatePercentage,
    groupBy,
    sleep,
    retry,
};