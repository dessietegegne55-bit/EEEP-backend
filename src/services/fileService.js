// backend/src/services/fileService.js

const fs = require('fs');
const path = require('path');
const { createError } = require('../middleware/errorHandler');

const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const getFileStats = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(stats);
      }
    });
  });
};

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const validateFileType = (filename, allowedTypes) => {
  const ext = path.extname(filename).toLowerCase();
  return allowedTypes.includes(ext);
};

const getFileUrl = (filename, type) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  return `${baseUrl}/uploads/${type}/${filename}`;
};

// Get file extension
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Get file name without extension
const getFileNameWithoutExtension = (filename) => {
  return path.basename(filename, path.extname(filename));
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Check if file exists
const fileExists = (filePath) => {
  return fs.existsSync(filePath);
};

// Read file as buffer
const readFileAsBuffer = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

// Write file from buffer
const writeFileFromBuffer = (filePath, buffer) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

module.exports = {
  deleteFile,
  getFileStats,
  ensureDirectoryExists,
  validateFileType,
  getFileUrl,
  getFileExtension,
  getFileNameWithoutExtension,
  formatFileSize,
  fileExists,
  readFileAsBuffer,
  writeFileFromBuffer,
};