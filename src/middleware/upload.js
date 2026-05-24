// backend/src/middleware/upload.js
// COMPLETE FIXED VERSION

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createError } = require('./errorHandler');

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = [
    'uploads/profiles',
    'uploads/id-photos',
    'uploads/exams',
    'uploads/materials',
    'uploads/question-images',
  ];

  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, '../../', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`📁 Created directory: ${fullPath}`);
    }
  });
};

createUploadDirs();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'others/';

    console.log(`📁 [MULTER] Processing file upload - fieldname: ${file.fieldname}`);

    if (file.fieldname === 'profileImage') {
      subfolder = 'profiles/';
    } else if (file.fieldname === 'idPhoto') {
      subfolder = 'id-photos/';
    } else if (file.fieldname === 'examFile') {
      subfolder = 'exams/';
    } else if (file.fieldname === 'file' || file.fieldname === 'materialFile') {
      subfolder = 'materials/';
    } else if (file.fieldname === 'questionImage') {
      subfolder = 'question-images/';
      console.log(`📸 [MULTER] Detected questionImage upload`);
    }

    const absolutePath = path.join(__dirname, '../../uploads', subfolder);
    console.log(`📁 [MULTER] Saving file to: ${absolutePath}`);

    // Ensure directory exists
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
      console.log(`📁 [MULTER] Created directory: ${absolutePath}`);
    }

    cb(null, absolutePath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);

    let prefix = 'file';
    if (file.fieldname === 'profileImage') prefix = 'profile';
    else if (file.fieldname === 'idPhoto') prefix = 'idphoto';
    else if (file.fieldname === 'examFile') prefix = 'exam';
    else if (file.fieldname === 'file' || file.fieldname === 'materialFile') prefix = 'material';
    else if (file.fieldname === 'questionImage') prefix = 'question';

    const filename = prefix + '-' + uniqueSuffix + ext;
    console.log(`📄 [MULTER] Generated filename: ${filename}`);

    cb(null, filename);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'video/mp4',
    'video/mpeg',
    'audio/mpeg',
    'text/plain'
  ];

  const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.mp4', '.mp3', '.txt'];

  const ext = path.extname(file.originalname).toLowerCase();
  const isExtAllowed = allowedExtensions.includes(ext);
  const isMimeAllowed = allowedMimeTypes.includes(file.mimetype);

  console.log(`📁 File upload: ${file.originalname} (${file.mimetype})`);

  if (isExtAllowed && isMimeAllowed) {
    cb(null, true);
  } else {
    cb(createError(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`, 400), false);
  }
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// Helper function to get the relative URL for a file
const getFileUrl = (file, subfolder) => {
  if (!file) return null;
  return `uploads/${subfolder}/${file.filename}`;
};

module.exports = upload;
module.exports.getFileUrl = getFileUrl;